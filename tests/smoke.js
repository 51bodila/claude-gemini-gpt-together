#!/usr/bin/env node
// Live smoke test: every installed model answers through its helper (real calls, uses your plan).
//   node tests/smoke.js            (uses the installed helpers in ~/.ai-team/lib, else the repo's lib)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const installed = path.join(os.homedir(), ".ai-team", "lib");
const lib = fs.existsSync(path.join(installed, "ask-gpt.js")) ? installed : path.join(__dirname, "..", "lib");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-team-smoke-"));
const task = path.join(tmp, "task.txt");
const expect = `A & B "C" | D — Привет`;
fs.writeFileSync(task, `Reply with exactly this text and nothing else: ${expect}`, "utf8");

const rows = [];
for (const [name, file, extra] of [["GPT", "ask-gpt.js", ["-Review"]], ["Gemini", "ask-gemini.js", []], ["Claude", "ask-claude.js", []]]) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(lib, file), ...extra, "--task-file", task, tmp],
    { encoding: "utf8", input: "", env: { ...process.env, AI_TEAM_ALLOW_SELF: "1" }, timeout: 20 * 60 * 1000, windowsHide: true });
  const out = (r.stdout || "").trim();
  rows.push({ model: name, result: r.status === 0 && out.includes(expect) ? "PASS" : "FAIL", seconds: Math.round((Date.now() - t) / 1000), answer: out.split(/\r?\n/)[0].slice(0, 90) });
}
for (const r of rows) console.log(`${r.model.padEnd(7)} ${r.result}  ${String(r.seconds).padStart(4)}s  ${r.answer}`);
process.exit(rows.some((r) => r.result === "FAIL") ? 1 : 0);
