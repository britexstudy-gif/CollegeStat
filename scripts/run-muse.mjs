/** Launch one reviewable task through the installed OpenCode CLI; never auto-select a provider. */
import { spawnSync } from "node:child_process";
import { readdir, access } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const promptDir = path.join(root, "docs/opencode-prompts");
const files = (await readdir(promptDir)).filter(file => file.endsWith(".md")).sort();
const args = process.argv.slice(2);
if (args.includes("--list") || args.includes("--help")) {
  console.log("Usage: node scripts/run-muse.mjs --task 01 --model CONNECTED_PROVIDER/EXACT_MODEL_ID#xhigh [--dry-run]");
  console.log("Choose an actual available provider/model and supported variant. No credentials or remote data are changed by this launcher itself.");
  console.log(files.join("\n"));
  process.exit(0);
}
const value = flag => args[args.indexOf(flag) + 1];
const task = args.includes("--task") ? value("--task") : "";
const model = args.includes("--model") ? value("--model") : "";
if (!/^\d{2}$/.test(task) || !model || !/^[^\s/]+\/[^\s]+$/.test(model)) {
  console.error("Supply a two-digit task and the exact connected provider/model identifier. Run --list for tasks.");
  process.exit(2);
}
const file = files.find(name => name.startsWith(task + "-"));
if (!file) throw new Error("Unknown task.");
const prompt = path.join(promptDir, file);
await access(prompt);
const command = ["run", "--standalone", "--model", model, "--file", prompt, "Complete the attached CollegeStat task in the existing repository. Read the current checkpoint first. Preserve source evidence, working features and publication boundaries."];
if (args.includes("--dry-run")) {
  console.log(JSON.stringify({ executable: "opencode", cwd: root, args: command, autoApprove: false, executed: false }, null, 2));
} else {
  const result = spawnSync("opencode", command, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
