// Runs every tests/*.test.js with the node test runner, one file at a time with a hard time limit,
// so a hang shows WHICH file hangs. Works on Node 18 and newer on every OS.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.js")).sort();
let failed = 0;
for (const f of files) {
  const t = Date.now();
  const r = spawnSync(process.execPath, ["--test", path.join(__dirname, f)], { stdio: "inherit", timeout: 120000, killSignal: "SIGKILL" });
  const secs = Math.round((Date.now() - t) / 1000);
  if (r.error && r.error.code === "ETIMEDOUT") { console.log(`### ${f}: HUNG (killed after ${secs}s)`); failed++; }
  else if (r.status !== 0) { console.log(`### ${f}: FAILED (exit ${r.status}, ${secs}s)`); failed++; }
  else console.log(`### ${f}: ok (${secs}s)`);
}
process.exit(failed ? 1 : 0);
