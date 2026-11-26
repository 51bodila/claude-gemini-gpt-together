#!/usr/bin/env node
// Antigravity PreToolUse hook (installed by install.js).
// Auto-allows ONLY a single call of an AI-team helper (ask-*, set-team, set-mode, list-models; optional .cmd).
// Anything else, or any chaining (&, |, ;, <, >, backtick, $( ) outside quotes), gets no decision,
// so Antigravity asks the user as usual.
"use strict";
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
  const c = cmd.trim().replace(/^&\s*/, "");            // PowerShell call operator
  const m = c.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
  if (!m) return false;
  const exe = (m[1] || m[2] || m[3]).replace(/\\/g, "/");
  const slash = exe.lastIndexOf("/");
  const name = exe.slice(slash + 1);
  const dir = slash < 0 ? "." : exe.slice(0, slash).toLowerCase();
  if (!HELPERS.test(name)) return false;
  if (dir !== "." && !dir.endsWith("/.ai-team/bin") && dir !== "~/.ai-team/bin" && dir !== "$home/.ai-team/bin") return false;
  const bare = unquotedPart(c.slice(m[0].length));
  if (bare === null) return false;
  return !/[&|;<>`\r\n]|\$\(/.test(bare);
}

if (require.main === module) {
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
}
module.exports = { isHelperCall };
