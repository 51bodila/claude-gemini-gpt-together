"use strict";
const H = require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const core = require("../lib/core");
const { line } = require("../lib/statusline");
const { route } = require("../lib/mentions-hook");
const { isHelperCall } = require("../lib/agy-allow-helpers");

// ---- statusline ----
test("statusline: pro line, probe rows not counted", () => {
  H.resetTeam();
  core.saveConfig({
    mode: "pro",
    roles: {
      builder: { tool: "gpt", model: "gpt-6.2-astra", effort: "high" },
      advisor: { tool: "gemini", model: "Gemini 4 Hydrogen (High)", effort: "" },
    },
  });
  core.log({ tool: "gpt", role: "builder", model: "m", status: "done", task: "a" });
  core.log({ tool: "gemini", role: "advisor", model: "m", status: "done", task: "b" });
  core.log({ tool: "gpt", role: "probe", model: "m", status: "done", task: "c" });
  assert.equal(line(), "pro · Astra high · Hydrogen High · 2 calls");
  H.resetTeam();
});
test("statusline: solo has no models; no log -> 0 calls", () => {
  H.resetTeam();
  core.saveConfig({ mode: "solo", roles: {} });
  assert.equal(line(), "solo · 0 calls");
  H.resetTeam();
});

// ---- mentions hook ----
test("mentions route", () => {
  assert.equal(route("hello there"), "");
  assert.equal(route("email me@gpt.com"), "");
  assert.match(route("@gpt please fix"), /@gpt: .*ask-gpt/);
  assert.doesNotMatch(route("@gpt please fix"), /-Model/);
  assert.match(route("@astra do it"), /-Model gpt-6\.2-astra/);
  assert.match(route("hey @luna"), /-Model gpt-6-luna/);
  assert.match(route("@hydrogen think"), /-Model "Gemini 4 Hydrogen \(High\)"/);
  assert.match(route("@flash think"), /Gemini 3\.8 Flash/);
  assert.match(route("@claude do"), /@claude: .*yourself/);
  assert.match(route("@all go"), /@all: /);
  const both = route("@gpt and @gemini");
  assert.match(both, /@gpt/); assert.match(both, /@gemini/);
});
test("mentions hook as process: silent without mention, prints with", () => {
  const f = path.join(H.LIB, "mentions-hook.js");
  const a = spawnSync(process.execPath, [f], { input: JSON.stringify({ prompt: "plain" }), encoding: "utf8" });
  assert.equal(a.stdout, "");
  const b = spawnSync(process.execPath, [f], { input: JSON.stringify({ prompt: "@gpt hi" }), encoding: "utf8" });
  assert.match(b.stdout, /^AI team mentions/);
  const c = spawnSync(process.execPath, [f], { input: "not json", encoding: "utf8" });
  assert.equal(c.stdout, "");
});

// ---- agy-allow-helpers (ported from the old tests/agy-allow-helpers.test.js) ----
const BIN = path.join(H.HOME, ".ai-team", "bin");
function decide(CommandLine, name = "run_command") {
  const r = spawnSync(process.execPath, [path.join(H.LIB, "agy-allow-helpers.js")], { input: JSON.stringify({ toolCall: { name, args: { CommandLine } } }), encoding: "utf8" });
  return r.stdout ? JSON.parse(r.stdout).decision : "none";
}
test("agy hook: allows plain helper calls", () => {
  assert.equal(decide("ask-gpt.cmd C:\\proj \"write the parser; then test & ship\""), "allow");
  assert.equal(decide(`"${BIN}\\ask-claude.cmd" . "Reply OK"`), "allow");
  assert.equal(decide(`& "${BIN}\\ask-team.cmd" builder . "task | with pipes in quotes"`), "allow");
  assert.equal(decide("set-mode eco"), "allow");
});
test("agy hook: does not allow chaining or other commands", () => {
  assert.equal(decide("ask-gpt.cmd . \"x\" & del C:\\file"), "none");
  assert.equal(decide("ask-gpt.cmd . \"x\"; rm -r C:\\"), "none");
  assert.equal(decide("ask-gpt.cmd . \"x\" | Out-File a.txt"), "none");
  assert.equal(decide("ask-gpt.cmd . $(evil)"), "none");
  assert.equal(decide("ask-gpt.cmd . \"unbalanced"), "none");
  assert.equal(decide("C:\\Temp\\ask-gpt.cmd . x"), "none");
  assert.equal(decide("powershell -c ask-gpt.cmd"), "none");
  assert.equal(decide("npm test"), "none");
  assert.equal(decide("ask-gpt.cmd x", "write_file"), "none");
});
test("isHelperCall: forward slashes and unix-style paths", () => {
  assert.equal(isHelperCall("C:/Users/x/.ai-team/bin/ask-gpt.cmd . \"t\""), true);
  assert.equal(isHelperCall("~/.ai-team/bin/ask-gpt . \"t\""), true);
  assert.equal(isHelperCall("/Users/x/.ai-team/bin/ask-team builder . \"t\""), true);
  assert.equal(isHelperCall("/tmp/ask-gpt . \"t\""), false);
  assert.equal(isHelperCall("/Users/x/.ai-team/bin/ask-gpt . \"t\" && rm x"), false);
  assert.equal(isHelperCall(undefined), false);
});

// ---- set-mode via child process ----
function setMode(arg) {
  const env = { ...process.env, AI_TEAM_HOME: H.HOME };
  const r = spawnSync(process.execPath, [path.join(H.LIB, "set-mode.js"), arg], { env, encoding: "utf8" });
  return { out: r.stdout.trim(), code: r.status };
}
test("set-mode eco / solo / bad", () => {
  H.resetTeam();
  const e = setMode("eco");
  assert.equal(e.code, 0);
  assert.match(e.out, /^SAVED: eco\./);
  let cfg = JSON.parse(fs.readFileSync(core.CFG, "utf8"));
  assert.equal(cfg.mode, "eco");
  assert.equal(cfg.roles.builder.model, "gpt-6-luna");
  assert.equal(cfg.roles.designer.model, "haiku");
  const s = setMode("solo");
  assert.match(s.out, /^SAVED: solo/);
  cfg = JSON.parse(fs.readFileSync(core.CFG, "utf8"));
  assert.equal(cfg.mode, "solo");
  const b = setMode("bogus");
  assert.equal(b.code, 4);
  assert.match(b.out, /^ERROR: usage/);
  H.resetTeam();
});
