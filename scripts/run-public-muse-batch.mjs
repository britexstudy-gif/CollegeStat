/** Public-source-only jobs; prepare by default, execute only with --run. */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, stat, copyFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

const repository = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (flag === "--run" || flag === "--help") options[flag] = true;
  else if (
    ["--task", "--limit", "--concurrency"].includes(flag) &&
    args[i + 1] &&
    !args[i + 1].startsWith("--")
  )
    options[flag] = args[++i];
  else throw new Error(`Unknown or incomplete option: ${flag}`);
}
if (options["--help"]) {
  console.log(
    "Prepare only: node scripts/run-public-muse-batch.mjs [--task 001] [--limit 100]\nExecute: add --run [--concurrency 1..10]. Reports remain unverified; no database writes.",
  );
  process.exit(0);
}
const boundedInteger = (value, fallback, maximum) => {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum)
    throw new Error(`Expected an integer between 1 and ${maximum}`);
  return number;
};
const concurrency = boundedInteger(options["--concurrency"], 3, 10);
const limit = boundedInteger(options["--limit"], 100, 100);
const manifest = JSON.parse(
  await readFile(
    path.join(repository, "data/review/muse-public-universities-oct12.json"),
    "utf8",
  ),
);
if (!Array.isArray(manifest.tasks) || manifest.tasks.length > 100)
  throw new Error(
    "Expected the reviewed public manifest, with at most 100 tasks",
  );
const seen = new Set();
for (const task of manifest.tasks) {
  if (
    !/^\d{3}$/.test(task.task) ||
    seen.has(task.task) ||
    typeof task.name !== "string" ||
    task.name.length > 200 ||
    /[\r\n]/.test(task.name)
  )
    throw new Error("Invalid public task metadata");
  seen.add(task.task);
  const website = new URL(task.website);
  if (
    !["http:", "https:"].includes(website.protocol) ||
    website.username ||
    website.password
  )
    throw new Error("Only public university HTTP(S) websites are allowed");
}
let selected = manifest.tasks;
if (options["--task"]) {
  selected = selected.filter((task) => task.task === options["--task"]);
  if (!selected.length)
    throw new Error("That task is not in the reviewed public manifest");
}
selected = selected.slice(0, limit);
const batchId = new Date().toISOString().replace(/[:.]/g, "-");
const folder = path.join("/tmp", `collegestat-muse-public-${batchId}`);
const receiptFolder = path.join(
  repository,
  "outputs",
  `muse-public-${batchId}`,
);
await mkdir(folder, { recursive: true });
await mkdir(receiptFolder, { recursive: true });
const template = await readFile(
  path.join(repository, "scripts/public-muse-prompt.md"),
  "utf8",
);
const jobs = [];
for (const task of selected) {
  const prompt = path.join(folder, `prompt-${task.task}.md`);
  const report = path.join(folder, `report-${task.task}.md`);
  const text = template
    .replaceAll("{{TASK}}", task.task)
    .replaceAll("{{NAME}}", task.name)
    .replaceAll("{{WEBSITE}}", task.website)
    .replaceAll("{{REPORT}}", report);
  await writeFile(prompt, text);
  await copyFile(prompt, path.join(receiptFolder, `prompt-${task.task}.md`));
  jobs.push({ ...task, prompt, report });
}
await writeFile(path.join(folder, "jobs.json"), JSON.stringify(jobs, null, 2));
const results = [];
let next = 0;
await mkdir(receiptFolder, { recursive: true });
const receiptPath = path.join(receiptFolder, "manifest.json");
let saving = Promise.resolve();
const save = () =>
  (saving = saving.then(() =>
    writeFile(
      receiptPath,
      JSON.stringify(
        {
          model: "opencode/muse-spark-1.3-contributor-free#xhigh",
          prepared: jobs.length,
          execution_requested: Boolean(options["--run"]),
          requested: jobs.length,
          concurrency,
          candidates_only: true,
          published_records: 0,
          tasks: jobs,
          jobs: results,
        },
        null,
        2,
      ),
    ),
  ));
await save();
console.log(
  JSON.stringify({
    prepared: jobs.length,
    execution_requested: Boolean(options["--run"]),
    receipt: receiptPath,
  }),
);
if (!options["--run"]) process.exit(0);
async function run(job) {
  const started = new Date().toISOString();
  const log = createWriteStream(path.join(folder, `log-${job.task}.txt`));
  const child = spawn(
    "opencode",
    [
      "run",
      "--standalone",
      "--model",
      "opencode/muse-spark-1.3-contributor-free#xhigh",
      "--file",
      job.prompt,
      "Complete only the attached public-source research task. Never read repository or private files.",
    ],
    { cwd: folder, shell: false, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let timedOut = false;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 5000);
      force.unref();
    },
    8 * 60 * 1000,
  );
  const exit = await new Promise((resolve) => {
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code));
  });
  clearTimeout(timeout);
  log.end();
  const bytes = await stat(job.report)
    .then((x) => x.size)
    .catch(() => 0);
  const savedReport = bytes
    ? path.join(receiptFolder, `report-${job.task}.md`)
    : null;
  if (savedReport) await copyFile(job.report, savedReport);
  results.push({
    task: job.task,
    university: job.name,
    started,
    finished: new Date().toISOString(),
    exit,
    timed_out: timedOut,
    report: savedReport,
    report_bytes: bytes,
    published_records: 0,
  });
  await save();
  console.log(
    JSON.stringify({
      completed: results.length,
      total: jobs.length,
      task: job.task,
      exit,
      report_bytes: bytes,
      timed_out: timedOut,
    }),
  );
}
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) await run(jobs[next++]);
  }),
);
await save();
if (results.some((result) => result.exit !== 0)) process.exitCode = 1;
