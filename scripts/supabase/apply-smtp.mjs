#!/usr/bin/env node
// Points Supabase Auth email (sign-in codes) at Resend SMTP for collegestat.xyz.
//
// Needs two files (never pasted in chat or committed):
//   ~/.config/collegestat/supabase-token     Supabase personal access token
//   ~/.config/collegestat/resend-smtp-key    Resend send-only API key for collegestat.xyz
//
//   node scripts/supabase/apply-smtp.mjs           # dry run
//   node scripts/supabase/apply-smtp.mjs --apply   # writes the change
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_REF = "yfyqikmanpgnvyfthzwe";
const apply = process.argv.includes("--apply");

const read = (name) => {
  const p = join(homedir(), ".config/collegestat", name);
  try {
    return readFileSync(p, "utf8").trim();
  } catch {
    console.error(`Missing ${p}`);
    process.exit(1);
  }
};
const token = read("supabase-token");
const resendKey = read("resend-smtp-key");

const api = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const current = await fetch(api, { headers });
if (!current.ok) {
  console.error(`Could not read auth config: HTTP ${current.status}`);
  process.exit(1);
}
const cfg = await current.json();
console.log(`Current SMTP host: ${cfg.smtp_host || "(built-in sender)"}; emails/hour limit: ${cfg.rate_limit_email_sent}`);

const patch = {
  external_email_enabled: true,
  smtp_host: "smtp.resend.com",
  smtp_port: "465",
  smtp_user: "resend",
  smtp_pass: resendKey,
  smtp_admin_email: "hello@collegestat.xyz",
  smtp_sender_name: "CollegeStat",
  smtp_max_frequency: 30,
  rate_limit_email_sent: 200,
};
console.log("Will set: smtp.resend.com:465, sender CollegeStat <hello@collegestat.xyz>, 200 emails/hour, 30 s between codes per user.");
if (!apply) {
  console.log("Dry run only. Re-run with --apply to write.");
  process.exit(0);
}
const res = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(patch) });
if (!res.ok) {
  console.error(`Update failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log("Applied.");
