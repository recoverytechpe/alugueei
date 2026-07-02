#!/usr/bin/env node
/**
 * CI security gate.
 *
 * Runs `supabase db lint` against the linked project and compares reported
 * finding IDs against `.security-baseline.json`. Fails when NEW internal_ids
 * are introduced.
 *
 * Requires env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const projectRef = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!projectRef || !token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF");
  process.exit(2);
}

let raw;
try {
  raw = execSync(
    `npx --yes supabase@latest db lint --linked --level warning --output json`,
    { encoding: "utf8", env: { ...process.env, SUPABASE_ACCESS_TOKEN: token } },
  );
} catch (e) {
  raw = e.stdout?.toString() ?? "";
  if (!raw) {
    console.error("supabase db lint failed:", e.message);
    process.exit(2);
  }
}

let findings = [];
try {
  findings = JSON.parse(raw);
} catch {
  console.error("Could not parse lint output as JSON:\n", raw);
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(".security-baseline.json", "utf8"));
const accepted = new Set(baseline.accepted ?? []);

const ids = findings.map(
  (f) => f.name ?? f.title ?? f.metadata?.name ?? JSON.stringify(f),
);
const unique = [...new Set(ids)];
const novel = unique.filter((id) => !accepted.has(id));

console.log(`Findings: ${unique.length}, accepted: ${accepted.size}, new: ${novel.length}`);
if (novel.length) {
  console.error("\n❌ New security findings detected:");
  for (const id of novel) console.error(`  - ${id}`);
  console.error(
    "\nReview each finding. If accepted, add its id to .security-baseline.json.",
  );
  process.exit(1);
}
console.log("✅ No new security findings.");
