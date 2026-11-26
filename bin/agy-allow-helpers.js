// Antigravity PreToolUse hook (optional, installed with -AgyAutoAllowHelpers).
// Auto-allows ONLY a single call of an AI-team helper (ask-*.cmd, set-team/set-mode/list-models).
// Anything else, or any chaining (&, |, ;, <, >, backtick, $( ) outside quotes), gets no decision,
// so Antigravity asks the user as usual.
const path = require("path");
const os = require("os");
const BIN = path.join(os.homedir(), ".ai-team", "bin").toLowerCase();
const HELPERS = /^(ask-gpt|ask-gemini|ask-claude|ask-team|set-team|set-mode|list-models)(\.cmd)?$/i;

function unquotedPart(cmd) {
  let out = "", q = null;
  for (const ch of cmd) {
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    out += ch;
  }
  return q ? null : out; // unbalanced quotes -> not allowed
}

function isHelperCall(cmd) {
  if (typeof cmd !== "string") return false;
  const c = cmd.trim().replace(/^&\s*/, "");          // PowerShell call operator
  const m = c.match(/^"([^"]+)"|^(\S+)/);
  if (!m) return false;
  const exe = (m[1] || m[2]).replace(/\//g, "\\");
  const name = path.win32.basename(exe);
  if (!HELPERS.test(name)) return false;
  const dir = path.win32.dirname(exe).toLowerCase();
  if (dir !== "." && dir !== BIN && !dir.endsWith("\\.ai-team\\bin")) return false;
  const bare = unquotedPart(c.slice(m[0].length));
  if (bare === null) return false;
  return !/[&|;<>`\r\n]|\$\(/.test(bare);
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let call;
  try { call = JSON.parse(raw).toolCall; } catch { return; }
  if (!call || call.name !== "run_command") return;
  if (isHelperCall(call.args && call.args.CommandLine)) {
    process.stdout.write(JSON.stringify({ decision: "allow", reason: "AI team helper call" }));
  }
});

module.exports = { isHelperCall };
