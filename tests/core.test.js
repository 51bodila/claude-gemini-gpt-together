"use strict";
const H = require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../lib/core");

const SPEC = { flags: ["review"], options: ["model", "effort", "role", "timeout-min", "task-file"] };

test("parseArgs: review flag spellings", () => {
  for (const f of ["-Review", "--review", "-review"]) assert.equal(core.parseArgs([f, "x"], SPEC).flags.review, true, f);
});
test("parseArgs: model forms", () => {
  assert.equal(core.parseArgs(["-Model", "m1", "t"], SPEC).opts.model, "m1");
  const r = core.parseArgs(["--model=m 2", "t"], SPEC);
  assert.equal(r.opts.model, "m 2");
  assert.deepEqual(r.rest, ["t"]);
});
test("parseArgs: unknown flags stay positional", () => {
  const r = core.parseArgs(["--weird", "-x", "task", "-5"], SPEC);
  assert.deepEqual(r.rest, ["--weird", "-x", "task", "-5"]);
  assert.deepEqual(r.flags, {});
});

test("dirTask: no folder -> cwd", () => {
  const r = core.dirTask(["do", "it"]);
  assert.equal(r.dir, path.resolve(process.cwd()));
  assert.equal(r.task, "do it");
});
test("dirTask: existing folder first", () => {
  const d = H.tmp("dt");
  const r = core.dirTask([d, "do", "it"]);
  assert.equal(r.dir, path.resolve(d));
  assert.equal(r.task, "do it");
});
test("dirTask: path-like missing folder", () => {
  const r = core.dirTask([path.join(H.HOME, "nope", "x"), "do"]);
  assert.equal(r.missingDir, true);
});
test("dirTask: --task-file read exactly", () => {
  const text = "He said \"hi\" & 'bye'\nстрока 2: Привет \"мир\"\n  tab\there $(x) 100%";
  const f = path.join(H.tmp("tf"), "t.txt");
  fs.writeFileSync(f, text + "\n", "utf8");
  const r = core.dirTask([], { "task-file": f });
  assert.equal(r.task, text);
});

test("dirTask: --task-file + one folder -> that folder; unknown name -> missingDir (review fix)", () => {
  const d = H.tmp("tfdir");
  const f = path.join(H.tmp("tf2"), "t.txt");
  fs.writeFileSync(f, "do it", "utf8");
  const r = core.dirTask([d], { "task-file": f });
  assert.equal(r.dir, path.resolve(d));
  assert.equal(r.task, "do it");
  assert.equal(core.dirTask(["no-such-project-folder"], { "task-file": f }).missingDir, true);
});

test("image.deliver never overwrites, workDir starts empty (review fix)", () => {
  const img = require("../lib/image");
  const w = img.workDir();
  assert.deepEqual(fs.readdirSync(w), []);
  const dest = H.tmp("deliver");
  fs.writeFileSync(path.join(dest, "pic.png"), "old");
  fs.writeFileSync(path.join(w, "pic.png"), "new");
  const p = img.deliver(path.join(w, "pic.png"), dest, "pic.png");
  assert.equal(path.basename(p), "pic-2.png");
  assert.equal(fs.readFileSync(path.join(dest, "pic.png"), "utf8"), "old");
  img.cleanup(w);
  assert.equal(fs.existsSync(w), false);
});

test("isLimit", () => {
  for (const s of ["usage limit reached", "429 Too Many Requests", "RESOURCE_EXHAUSTED"]) assert.equal(core.isLimit(s), true, s);
  for (const s of ["id 1429x", "normal answer", "", null]) assert.equal(core.isLimit(s), false, String(s));
});

test("log writes CSV row and never throws", () => {
  H.resetTeam();
  core.log({ tool: "gpt", role: "builder", model: "m", effort: "high", seconds: 1.4, status: "done", task: "say \"hi\", ok\nnext" });
  const lines = fs.readFileSync(core.LOG, "utf8").trim().split("\n");
  assert.equal(lines[0], "time,tool,role,model,effort,seconds,status,task");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,gpt,builder,m,high,1,done,"say 'hi', ok next"$/);
  H.resetTeam();
  fs.mkdirSync(core.LOG, { recursive: true }); // LOG is a directory: appends fail
  assert.doesNotThrow(() => core.log({ tool: "gpt", role: "r", status: "done", task: "x" }));
  H.resetTeam();
});

test("readConfig defaults + saveConfig round-trip", () => {
  H.resetTeam();
  const c = core.readConfig();
  assert.equal(c.mode, "pro");
  assert.deepEqual(Object.keys(c.roles).sort(), ["advisor", "builder", "designer", "reviewer"]);
  assert.equal(c.roles.builder.tool, "gpt");
  c.mode = "eco";
  c.roles.builder = { tool: "claude", model: "haiku", effort: "low" };
  core.saveConfig(c);
  const c2 = core.readConfig();
  assert.equal(c2.mode, "eco");
  assert.deepEqual(c2.roles.builder, { tool: "claude", model: "haiku", effort: "low" });
  assert.equal(c2.roles.advisor.tool, "gemini");
  H.resetTeam();
});

// ---- core.run byte-exactness (fake CLI run by node itself) ----
const ECHO = path.join(H.FIX, "echo-cli.js");
const NASTY = [
  "A & B \"C\" | D",
  "$(rm -rf /)",
  "100% ^caret",
  "Привет \"мир\"",
  "emoji 😀🚀 ok",
  "line1\nline2\nline3\n\nend",
  "back\\slash \\\" quote",
  "`tick` ; > < !",
];
for (const s of NASTY) {
  test("run byte-exact: " + JSON.stringify(s).slice(0, 40), async () => {
    const r = await core.run({ cmd: process.execPath, args: [ECHO, s, "--flag=" + s], input: s });
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.argv, [s, "--flag=" + s]);
    assert.equal(j.stdin, s);
  });
}

test("run: dropEnv removes matching vars (case-insensitive, * wildcard)", async () => {
  Object.assign(process.env, { DROPME_A: "1", DROPME_B: "2", KEEPME: "3", exact_one: "4", ECHO_ENV_KEYS: "DROPME_A,DROPME_B,KEEPME,exact_one" });
  const r = await core.run({ cmd: process.execPath, args: [ECHO], dropEnv: ["DROPME_*", "EXACT_ONE"] });
  delete process.env.ECHO_ENV_KEYS;
  const env = JSON.parse(r.out).env;
  assert.equal(env.DROPME_A, null);
  assert.equal(env.DROPME_B, null);
  assert.equal(env.exact_one, null);
  assert.equal(env.KEEPME, "3");
});

test("run: timeout -> code 124, timedOut", async () => {
  const t = Date.now();
  const r = await core.run({ cmd: process.execPath, args: [ECHO, "--sleep"], timeoutMs: 700 });
  assert.equal(r.code, 124);
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - t < 15000);
});

test("run: missing command -> code 127", async () => {
  const r = await core.run({ cmd: path.join(H.HOME, "no-such-cmd"), args: [] });
  assert.equal(r.code, 127);
});
