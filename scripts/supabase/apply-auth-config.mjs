#!/usr/bin/env node
// Applies the CollegeStat auth email templates, subjects and redirect URLs to the hosted
// Supabase project through the Supabase Management API.
//
// Needs a Supabase personal access token in a file (never pasted in chat or committed):
//   ~/.config/collegestat/supabase-token   (chmod 600)
// Create one at https://supabase.com/dashboard/account/tokens
//
//   node scripts/supabase/apply-auth-config.mjs           # dry run: shows what would change
//   node scripts/supabase/apply-auth-config.mjs --apply   # writes the change
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_REF = "yfyqikmanpgnvyfthzwe";
const SITE = "https://collegestat.xyz";
// The original workers.dev origin still serves the app; keep its auth redirects allowed.
const LEGACY_SITE = "https://collegestat.britexstudy-15d.workers.dev";
const LOCAL = "http://127.0.0.1:5173";
const apply = process.argv.includes("--apply");

const tokenPath = join(homedir(), ".config/collegestat/supabase-token");
let token;
try {
  token = readFileSync(tokenPath, "utf8").trim();
} catch {
  console.error(`No token file at ${tokenPath}. Create a personal access token and save it there.`);
  process.exit(1);
}

const dir = new URL("../../supabase/templates/", import.meta.url);
const tpl = (f) => readFileSync(new URL(f, dir), "utf8");

const api = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const current = await fetch(api, { headers });
if (!current.ok) {
  console.error(`Could not read auth config: HTTP ${current.status} ${(await current.text()).slice(0, 200)}`);
  process.exit(1);
}
const cfg = await current.json();

const wanted = [
  `${SITE}/auth/callback`,
  `${SITE}/auth/reset-password`,
  `${LEGACY_SITE}/auth/callback`,
  `${LEGACY_SITE}/auth/reset-password`,
  `${LOCAL}/auth/callback`,
  `${LOCAL}/auth/reset-password`,
];
const existing = (cfg.uri_allow_list || "").split(",").map((s) => s.trim()).filter(Boolean);
const allow = [...new Set([...existing, ...wanted])].join(",");

const patch = {
  site_url: SITE,
  uri_allow_list: allow,
  mailer_subjects_magic_link: "Your CollegeStat sign-in code",
  mailer_templates_magic_link_content: tpl("magic_link.html"),
  mailer_subjects_confirmation: "Confirm your CollegeStat account",
  mailer_templates_confirmation_content: tpl("confirmation.html"),
  mailer_subjects_email_change: "Confirm your new CollegeStat email",
  mailer_templates_email_change_content: tpl("email_change.html"),
  mailer_subjects_recovery: "Reset your CollegeStat password",
  mailer_templates_recovery_content: tpl("recovery.html"),
};

console.log("Current:");
console.log(`  site_url: ${cfg.site_url}`);
console.log(`  redirect URLs: ${existing.length ? existing.join(", ") : "(none)"}`);
console.log(`  email OTP expiry (s): ${cfg.mailer_otp_exp}`);
console.log(`  email signups disabled: ${cfg.disable_signup}`);
console.log(`  custom SMTP: ${cfg.smtp_host ? cfg.smtp_host : "(none, built-in sender)"}`);
console.log("Will set:");
console.log(`  site_url: ${SITE}`);
console.log(`  redirect URLs: ${allow}`);
console.log("  4 email templates + subjects (magic link, confirm sign up, email change, recovery)");

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to write.");
  process.exit(0);
}
const res = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(patch) });
if (!res.ok) {
  console.error(`Update failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log("\nApplied.");
