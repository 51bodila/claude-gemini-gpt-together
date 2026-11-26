#!/usr/bin/env node
// Claude Code status line, e.g. "pro · Astra high · Hydrogen High · 12 calls". Fast: reads two files, calls nothing.
"use strict";
const fs = require("fs");
const core = require("./core");

function short(r) {
  if (!r) return "";
  let m = String(r.model || "default");
  const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  if (r.tool === "gpt") m = title(m.replace(/^gpt-[\d.]+-/i, ""));
  else if (r.tool === "gemini") m = m.replace(/^Gemini [\d.]+ /i, "").replace(/[()]/g, "");
  else if (r.tool === "claude") m = "Claude " + title(m);
  return r.effort ? `${m} ${r.effort}` : m;
}
function todayCalls() {
  try {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return fs.readFileSync(core.LOG, "utf8").split("\n").filter((l) => l.startsWith(today) && !/,probe,/.test(l)).length;
  } catch { return 0; }
}
function line() {
  const cfg = core.readConfig();
  const parts = [cfg.mode];
  if (cfg.mode !== "solo") parts.push(short(cfg.roles.builder), short(cfg.roles.advisor));
  parts.push(`${todayCalls()} calls`);
  return parts.filter(Boolean).join(" · ");
}
if (require.main === module) {
  if (process.stdin.isTTY) process.stdout.write(line());
  else process.stdin.on("data", () => {}).on("end", () => process.stdout.write(line()));
}
module.exports = { line, short };
