// node --test tests/   : the Antigravity hook must allow only single AI-team helper calls.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const hook = path.join(__dirname, "..", "bin", "agy-allow-helpers.js");
const BIN = path.join(os.homedir(), ".ai-team", "bin");

function decide(CommandLine, name = "run_command") {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ toolCall: { name, args: { CommandLine } } }), encoding: "utf8" });
  return r.stdout ? JSON.parse(r.stdout).decision : "none";
}

test("allows plain helper calls", () => {
  assert.equal(decide('ask-gpt.cmd C:\\proj "write the parser; then test & ship"'), "allow");
  assert.equal(decide(`"${BIN}\\ask-claude.cmd" . "Reply OK"`), "allow");
  assert.equal(decide(`& "${BIN}\\ask-team.cmd" builder . "task | with pipes in quotes"`), "allow");
  assert.equal(decide("set-mode eco"), "allow");
});

test("does not allow chaining or other commands", () => {
  assert.equal(decide('ask-gpt.cmd . "x" & del C:\\file'), "none");
  assert.equal(decide('ask-gpt.cmd . "x"; rm -r C:\\'), "none");
  assert.equal(decide('ask-gpt.cmd . "x" | Out-File a.txt'), "none");
  assert.equal(decide("ask-gpt.cmd . $(evil)"), "none");
  assert.equal(decide('ask-gpt.cmd . "unbalanced'), "none");
  assert.equal(decide("C:\\Temp\\ask-gpt.cmd . x"), "none");
  assert.equal(decide("powershell -c ask-gpt.cmd"), "none");
  assert.equal(decide("npm test"), "none");
  assert.equal(decide("ask-gpt.cmd x", "write_file"), "none");
});
