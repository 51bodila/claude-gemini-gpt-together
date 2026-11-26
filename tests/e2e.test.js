"use strict";
const H = require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TASK = "Fix \"parse\" & $(rm -rf /) 100% ^x | y\nСтрока 2: Привет \"мир\" 😀\n  indented";

function runHelper(script, args, extraEnv = {}) {
  const env = { ...process.env, AI_TEAM_HOME: H.HOME, ...extraEnv };
  delete env.CLAUDECODE;
  const r = spawnSync(process.execPath, [path.join(H.LIB, script), ...args], { env, encoding: "utf8", timeout: 60000 });
  return { out: (r.stdout || "").replace(/\r?\n$/, ""), err: r.stderr || "", code: r.status };
}
function taskFile(text = TASK) {
  const f = path.join(H.tmp("task"), "task.txt");
  fs.writeFileSync(f, text, "utf8");
  return f;
}
function logRows() {
  try { return fs.readFileSync(path.join(H.TEAM, "log.csv"), "utf8").trim().split("\n").slice(1); } catch { return []; }
}

const FAKE_CODEX = `
const a = process.argv.slice(2);
if (a[0] === "login" && a[1] === "status") { console.log("Logged in using ChatGPT"); process.exit(0); }
const i = a.indexOf("--output-last-message");
let s = ""; process.stdin.setEncoding("utf8");
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => { require("fs").writeFileSync(a[i + 1], s, "utf8"); console.log("sandbox=" + a[a.indexOf("--sandbox") + 1]); });
`;

test("ask-gpt -Review end-to-end with fake codex", () => {
  H.resetTeam();
  const codex = H.makeFake("codex", FAKE_CODEX);
  const dir = H.tmp("proj");
  const r = runHelper("ask-gpt.js", ["-Review", dir, "--task-file", taskFile()], { AI_TEAM_CODEX: codex });
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(r.out.endsWith(TASK), "task text must arrive exactly; got: " + r.out);
  assert.match(r.out, /^You are a strict code reviewer/);
  const rows = logRows();
  assert.equal(rows.length, 1);
  assert.match(rows[0], /,gpt,reviewer,.*,done,/);
});

test("ask-gpt build uses workspace-write; missing folder exits 4; no task exits 4", () => {
  H.resetTeam();
  const codex = H.makeFake("codex2", `
const a = process.argv.slice(2);
if (a[0] === "login") { console.log("Logged in"); process.exit(0); }
const i = a.indexOf("--output-last-message");
require("fs").writeFileSync(a[i + 1], "sandbox=" + a[a.indexOf("--sandbox") + 1], "utf8");
process.stdin.resume();
`);
  const dir = H.tmp("proj");
  const r = runHelper("ask-gpt.js", [dir, "do it"], { AI_TEAM_CODEX: codex });
  assert.equal(r.out, "sandbox=workspace-write");
  const m = runHelper("ask-gpt.js", [path.join(H.HOME, "nope", "x"), "do"], { AI_TEAM_CODEX: codex });
  assert.equal(m.code, 4);
  assert.match(m.out, /^ERROR: folder not found/);
  const n = runHelper("ask-gpt.js", [dir, "--task-file", taskFile("   ")], { AI_TEAM_CODEX: codex });
  assert.equal(n.code, 4);
});

test("ask-gpt not signed in -> exit 3", () => {
  const codex = H.makeFake("codex3", `console.log("Not logged in"); process.stdin.resume();`);
  const r = runHelper("ask-gpt.js", [H.tmp("p"), "x"], { AI_TEAM_CODEX: codex });
  assert.equal(r.code, 3);
  assert.match(r.out, /^ERROR: Codex is not signed in/);
});

const FAKE_AGY = `
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1];
console.log(JSON.stringify({ status: "SUCCESS", response: p }));
`;

test("ask-gemini end-to-end with fake agy", () => {
  H.resetTeam();
  fs.mkdirSync(H.TEAM, { recursive: true });
  fs.writeFileSync(path.join(H.TEAM, "allow-agy"), "");
  const agy = H.makeFake("agy", FAKE_AGY);
  const r = runHelper("ask-gemini.js", [H.tmp("p"), "--task-file", taskFile()], { AI_TEAM_AGY: agy });
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(r.out.endsWith(TASK), "got: " + r.out);
  const rows = logRows();
  assert.equal(rows.length, 1);
  assert.match(rows[0], /,gemini,advisor,.*,done,/);
});

test("ask-gemini ERROR json with model list -> one ERROR line with Models on your plan", () => {
  H.resetTeam();
  fs.mkdirSync(H.TEAM, { recursive: true });
  fs.writeFileSync(path.join(H.TEAM, "allow-agy"), "");
  const agy = H.makeFake("agy-err", `console.log(JSON.stringify({status:"ERROR", error:"invalid model 'zzz'.\\nAvailable models:\\n  Gemini A (High)\\n  Gemini B (Low)"}));`);
  const r = runHelper("ask-gemini.js", [H.tmp("p"), "-Model", "zzz", "hello"], { AI_TEAM_AGY: agy });
  assert.notEqual(r.code, 0);
  assert.equal(r.out.split("\n").length, 1);
  assert.match(r.out, /^ERROR: .*Models on your plan: Gemini A \(High\), Gemini B \(Low\)/);
});

test("ask-claude end-to-end with fake claude", () => {
  H.resetTeam();
  const claude = H.makeFake("claude", `
// The prompt arrives as the first argument (real claude 2.1.x hangs when the prompt is piped on stdin).
console.log(JSON.stringify({ result: process.argv[2], is_error: false }));
`);
  const r = runHelper("ask-claude.js", [H.tmp("p"), "--task-file", taskFile()], { AI_TEAM_CLAUDE: claude, AI_TEAM_ALLOW_SELF: "1" });
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(r.out.endsWith(TASK), "got: " + r.out);
  assert.match(logRows()[0], /,claude,designer,.*,done,/);
});

test("ask-claude refuses to call itself (exit 7) when CLAUDECODE=1", () => {
  const claude = H.makeFake("claude-self", `console.log("{}")`);
  const r = runHelper("ask-claude.js", [H.tmp("p"), "x"], { AI_TEAM_CLAUDE: claude, CLAUDECODE: "1" });
  // runHelper deletes CLAUDECODE from env, so spawn directly
  const env = { ...process.env, AI_TEAM_HOME: H.HOME, AI_TEAM_CLAUDE: claude, CLAUDECODE: "1" };
  delete env.AI_TEAM_ALLOW_SELF;
  const s = spawnSync(process.execPath, [path.join(H.LIB, "ask-claude.js"), H.tmp("p"), "x"], { env, encoding: "utf8" });
  assert.equal(s.status, 7);
  assert.ok(r);
});

// ---------- -Image mode ----------
const PNG_WRITER = `
const fs = require("fs"), path = require("path");
function png() { return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(20000, 7)]); }
`;
const FAKE_CODEX_IMG = String.raw`${PNG_WRITER}
const a = process.argv.slice(2);
if (a[0] === "login") { console.log("Logged in"); process.exit(0); }
let s = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const m = /as (\S+\.png)\./.exec(s);
  fs.writeFileSync(path.join(process.cwd(), m[1]), png());
  fs.writeFileSync(a[a.indexOf("--output-last-message") + 1], m[1] + "|" + a[a.indexOf("--sandbox") + 1], "utf8");
});
`;
const FAKE_CODEX_NOIMG = `
const a = process.argv.slice(2);
if (a[0] === "login") { console.log("Logged in"); process.exit(0); }
require("fs").writeFileSync(a[a.indexOf("--output-last-message") + 1], "I could not", "utf8");
process.stdin.resume();
`;

test("ask-gpt -Image saves the picture, prints its path, logs role image", () => {
  H.resetTeam();
  const dir = H.tmp("img");
  const r = runHelper("ask-gpt.js", ["-Image", "--out", "cat.png", dir, "a cat"], { AI_TEAM_CODEX: H.makeFake("codex-img", FAKE_CODEX_IMG) });
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(r.out, path.join(fs.realpathSync(dir), "cat.png"));
  assert.ok(fs.statSync(r.out).size > 10240);
  assert.match(logRows()[0], /,gpt,image,.*,done,/);
});

test("ask-gpt -Image default name gpt-<stamp>.png; no file -> ERROR exit 1", () => {
  H.resetTeam();
  const d1 = H.tmp("img");
  const r = runHelper("ask-gpt.js", ["-Image", d1, "a cat"], { AI_TEAM_CODEX: H.makeFake("codex-img2", FAKE_CODEX_IMG) });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(path.basename(r.out), /^gpt-\d{8}-\d{6}\.png$/);
  const e = runHelper("ask-gpt.js", ["-Image", H.tmp("img"), "a cat"], { AI_TEAM_CODEX: H.makeFake("codex-noimg", FAKE_CODEX_NOIMG) });
  assert.equal(e.code, 1);
  assert.match(e.out, /^ERROR: GPT did not produce an image/);
});

const FAKE_AGY_IMG = String.raw`${PNG_WRITER}
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1];
const m = /\bas (\S+\.png) /.exec(p);
if (a.includes("--mode")) { console.log(JSON.stringify({ status: "SUCCESS", response: "plan mode passed" })); process.exit(0); }
if (m && !process.env.NO_WRITE) fs.writeFileSync(path.join(process.cwd(), m[1]), png());
console.log(JSON.stringify({ status: "SUCCESS", response: m ? m[1] : "?" }));
`;

test("ask-gemini -Image: no --mode plan, file saved; normal mode still passes --mode plan; no file -> exit 1", () => {
  H.resetTeam();
  fs.mkdirSync(H.TEAM, { recursive: true });
  fs.writeFileSync(path.join(H.TEAM, "allow-agy"), "");
  const agy = H.makeFake("agy-img", FAKE_AGY_IMG);
  const dir = H.tmp("img");
  const r = runHelper("ask-gemini.js", ["-Image", "--out", "g.png", dir, "a cat"], { AI_TEAM_AGY: agy });
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(r.out, path.join(path.resolve(dir), "g.png"));
  assert.match(logRows()[0], /,gemini,image,.*,done,/);
  const n = runHelper("ask-gemini.js", [H.tmp("p"), "hello"], { AI_TEAM_AGY: agy });
  assert.equal(n.out, "plan mode passed");
  const e = runHelper("ask-gemini.js", ["-Image", H.tmp("img"), "a cat"], { AI_TEAM_AGY: agy, NO_WRITE: "1" });
  assert.equal(e.code, 1);
  assert.match(e.out, /^ERROR: Gemini did not produce an image/);
});

test("ask-claude -Image -> exit 4", () => {
  const claude = H.makeFake("claude-img", `console.log("{}")`);
  const r = runHelper("ask-claude.js", ["-Image", H.tmp("p"), "a cat"], { AI_TEAM_CLAUDE: claude, AI_TEAM_ALLOW_SELF: "1" });
  assert.equal(r.code, 4);
  assert.match(r.out, /^ERROR: Claude can't generate raster images/);
});
