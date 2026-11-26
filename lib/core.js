// AI team core: shared by every helper. Node 18+, no dependencies, Windows / macOS / Linux.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const IS_WIN = process.platform === "win32";
const HOME = process.env.AI_TEAM_HOME || os.homedir();
const TEAM = path.join(HOME, ".ai-team");
const BIN = path.join(TEAM, "bin");
const CFG = path.join(TEAM, "config.json");
const MODES = path.join(TEAM, "modes.json");
const LOG = path.join(TEAM, "log.csv");

const DEFAULT_ROLES = {
  builder: { tool: "gpt", model: "", effort: "high" },
  reviewer: { tool: "gpt", model: "", effort: "medium" },
  advisor: { tool: "gemini", model: "", effort: "" },
  designer: { tool: "claude", model: "opus", effort: "" },
};

// ---------- config ----------
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
function readConfig() {
  const c = readJson(CFG, {}) || {};
  const roles = { ...DEFAULT_ROLES };
  for (const [k, v] of Object.entries(c.roles || {})) roles[k] = { tool: v.tool, model: v.model || "", effort: v.effort || "" };
  return { mode: c.mode || "pro", roles };
}
function saveConfig(cfg) { writeJson(CFG, cfg); }
// Model + effort for a tool called directly: the preferred role if that tool plays it, else the first role it plays.
function toolDefault(cfg, tool, prefer) {
  if (prefer && cfg.roles[prefer] && cfg.roles[prefer].tool === tool) return cfg.roles[prefer];
  for (const r of ["builder", "reviewer", "advisor", "designer"]) if (cfg.roles[r] && cfg.roles[r].tool === tool) return cfg.roles[r];
  return { tool, model: "", effort: "" };
}

// ---------- log ----------
function csv(v) { const s = String(v ?? "").replace(/[\r\n]+/g, " "); return /[",]/.test(s) ? '"' + s.replace(/"/g, "'") + '"' : s; }
function log({ tool, role, model, effort, seconds, status, task }) {
  try {
    fs.mkdirSync(TEAM, { recursive: true });
    if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, "time,tool,role,model,effort,seconds,status,task\n", "utf8");
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const time = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const t = String(task || "").slice(0, 80);
    fs.appendFileSync(LOG, [time, tool, role, model || "default", effort || "", Math.round(seconds || 0), status, t].map(csv).join(",") + "\n", "utf8");
  } catch { /* logging must never break a call */ }
}

// ---------- detection ----------
function isLimit(text) {
  return /usage limit|rate[ -]?limit|quota|limit reached|hit your .*limit|too many requests|resource[ _]?exhausted|\b429\b/i.test(String(text || ""));
}

// ---------- finding the CLIs ----------
function exists(p) { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } }
function onPath(names) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const d of dirs) for (const n of names) { const p = path.join(d, n); if (exists(p)) return p; }
  return null;
}
function newest(globDir, rel) { // newest <globDir>/<*>/<rel...> (one or two wildcard levels)
  try {
    const out = [];
    const walk = (dir, parts) => {
      if (!parts.length) { if (exists(dir)) out.push(dir); return; }
      const [head, ...tail] = parts;
      if (head === "*") { for (const e of fs.readdirSync(dir)) walk(path.join(dir, e), tail); }
      else walk(path.join(dir, head), tail);
    };
    walk(globDir, rel);
    return out.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  } catch { return null; }
}
// Returns { cmd, pre } so we can always spawn WITHOUT a shell: spawn(cmd, [...pre, ...args]).
// npm's .cmd shims would need cmd.exe (which mangles quotes), so on Windows we run the package's JS with node.
function npmJs(pkgRel) {
  const roots = [];
  if (IS_WIN && process.env.APPDATA) roots.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  try { roots.push(path.join(require("child_process").execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).toString().trim())); } catch {}
  for (const r of roots) { const p = path.join(r, pkgRel); if (exists(p)) return p; }
  return null;
}
// Override any CLI with env AI_TEAM_CODEX / AI_TEAM_CLAUDE / AI_TEAM_AGY (a .js file runs with node).
function fromEnv(name) {
  const v = process.env[name];
  if (!v) return null;
  return /\.[cm]?js$/i.test(v) ? { cmd: process.execPath, pre: [v] } : { cmd: v, pre: [] };
}
function findCodex() {
  if (fromEnv("AI_TEAM_CODEX")) return fromEnv("AI_TEAM_CODEX");
  const js = npmJs(path.join("@openai", "codex", "bin", "codex.js"));
  if (js) return { cmd: process.execPath, pre: [js] };
  const exe = onPath(IS_WIN ? ["codex.exe"] : ["codex"]);
  if (exe) return { cmd: exe, pre: [] };
  if (!IS_WIN) for (const p of ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]) if (exists(p)) return { cmd: p, pre: [] };
  return null;
}
function findClaude() {
  if (fromEnv("AI_TEAM_CLAUDE")) return fromEnv("AI_TEAM_CLAUDE");
  const exe = onPath(IS_WIN ? ["claude.exe"] : ["claude"]);
  if (exe) return { cmd: exe, pre: [] };
  const local = path.join(HOME, ".local", "bin", IS_WIN ? "claude.exe" : "claude");
  if (exists(local)) return { cmd: local, pre: [] };
  const js = npmJs(path.join("@anthropic-ai", "claude-code", "cli.js"));
  if (js) return { cmd: process.execPath, pre: [js] };
  if (IS_WIN && process.env.LOCALAPPDATA) { // Claude desktop app's bundled Claude Code
    const b = newest(path.join(process.env.LOCALAPPDATA, "Claude-Data"), ["*", "claude-code", "*", "*", "claude.exe"]);
    if (b) return { cmd: b, pre: [] };
  }
  if (!IS_WIN) for (const p of ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"]) if (exists(p)) return { cmd: p, pre: [] };
  return null;
}
function findAgy() {
  if (fromEnv("AI_TEAM_AGY")) return fromEnv("AI_TEAM_AGY");
  const cands = IS_WIN
    ? [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe"), onPath(["agy.exe"])]
    : [onPath(["agy"]), path.join(HOME, ".local", "bin", "agy"), path.join(HOME, ".agy", "bin", "agy"), "/opt/homebrew/bin/agy", "/usr/local/bin/agy"];
  for (const c of cands) if (exists(c)) return { cmd: c, pre: [] };
  return null;
}

// ---------- running ----------
// Spawns without a shell (arguments arrive byte-exact), writes `input` to stdin and closes it, hard timeout.
function run({ cmd, args = [], input = "", cwd, timeoutMs = 30 * 60 * 1000, dropEnv = [] }) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const pat of dropEnv) {
      const re = new RegExp("^" + pat.replace(/\*/g, ".*") + "$", "i");
      for (const k of Object.keys(env)) if (re.test(k)) delete env[k];
    }
    let out = "", err = "", done = false, timedOut = false;
    let child;
    // detached on macOS/Linux = own process group, so a timeout can kill the CLI and everything it started.
    try { child = spawn(cmd, args, { cwd, env, windowsHide: true, detached: !IS_WIN, stdio: ["pipe", "pipe", "pipe"] }); }
    catch (e) { return resolve({ out: "", err: String(e.message || e), code: 127, timedOut: false }); }
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { if (done) return; done = true; clearTimeout(timer); resolve({ out, err: err + String(e.message || e), code: 127, timedOut }); });
    child.on("close", (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ out, err, code: timedOut ? 124 : (code ?? 1), timedOut }); });
    child.stdin.on("error", () => {});
    child.stdin.end(input || "");
  });
}
function killTree(child) {
  try {
    if (IS_WIN) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
  } catch {}
}

// ---------- arguments ----------
// parseArgs(argv, { flags: ["review","build"], options: ["model","effort","role","timeout-min","timeout-sec","task-file"] })
// Accepts -Review / --review / -review, -Model x / --model=x. Everything else is positional.
function parseArgs(argv, spec) {
  const flags = {}, opts = {}, rest = [];
  const fl = new Set((spec.flags || []).map((s) => s.toLowerCase()));
  const op = new Set((spec.options || []).map((s) => s.toLowerCase()));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = /^--?([A-Za-z][\w-]*)(?:=(.*))?$/.exec(a);
    if (m) {
      const k = m[1].toLowerCase().replace(/^timeoutmin$/, "timeout-min").replace(/^timeoutsec$/, "timeout-sec");
      if (fl.has(k)) { flags[k] = true; continue; }
      if (op.has(k)) { opts[k] = m[2] !== undefined ? m[2] : argv[++i]; continue; }
    }
    rest.push(a);
  }
  return { flags, opts, rest };
}
// "<folder> task words" or "task words" (folder = cwd). Task can also come from --task-file or stdin ("-").
function dirTask(rest, opts = {}) {
  let dir = process.cwd(), words = rest;
  // With --task-file the task is not on the command line, so a single positional is the folder.
  const need = opts["task-file"] ? 1 : 2;
  if (rest.length >= need && isDir(rest[0])) { dir = rest[0]; words = rest.slice(1); }
  else if (rest.length >= need && !isDir(rest[0]) && (/[\\/]/.test(rest[0]) || opts["task-file"])) return { dir: rest[0], task: opts["task-file"] ? "" : rest.slice(1).join(" "), missingDir: true };
  let task = words.join(" ");
  if (opts["task-file"]) task = fs.readFileSync(opts["task-file"], "utf8");
  else if (task === "-") task = readStdin();
  return { dir: path.resolve(dir), task: task.trim() };
}
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function readStdin() { try { return fs.readFileSync(0, "utf8"); } catch { return ""; } }

function lastLines(text, n) { return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(-n).join(" | "); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function finish(out, code) { process.stdout.write(String(out).trim() + "\n", () => process.exit(code)); }

module.exports = {
  IS_WIN, HOME, TEAM, BIN, CFG, MODES, LOG, DEFAULT_ROLES,
  readJson, writeJson, readConfig, saveConfig, toolDefault, log, isLimit,
  findCodex, findClaude, findAgy, run, parseArgs, dirTask, lastLines, sleep, finish,
};
