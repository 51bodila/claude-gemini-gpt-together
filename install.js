#!/usr/bin/env node
// AI team installer (Windows / macOS / Linux, Node 18+, no dependencies). Safe to run again: it updates its own blocks and files only.
// Every file it changes is backed up to ~/.ai-team/backup/<timestamp> first. It never deletes your files.
//   node install.js [--mode eco|pro|max|solo] [--accept-agy-risk] [--agy-auto-allow-helpers] [--home <dir>] [--no-path]
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const MODES = ["eco", "pro", "max", "solo"];
const BLOCK_RE = /<!-- AI-TEAM START[^>]*-->[\s\S]*?<!-- AI-TEAM END -->/;
const PATH_RE = /# AI-TEAM PATH START[\s\S]*?# AI-TEAM PATH END/;

const fwd = (p) => p.replace(/\\/g, "/");
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// Everything that depends on the home folder lives here, so uninstall.js can reuse it.
function makeCtx(home, backupSuffix = "") {
  home = path.resolve(home);
  const realHome = path.resolve(os.homedir()) === home;
  const team = path.join(home, ".ai-team");
  const bin = path.join(team, "bin");
  const lib = path.join(team, "lib");
  const backupRoot = path.join(team, "backup");
  const backup = path.join(backupRoot, stamp() + backupSuffix);
  const ctx = { home, realHome, team, bin, lib, backupRoot, backup, done: [] };

  const relName = (p) => path.relative(home, p).replace(/[\\/:]/g, "_");
  ctx.saveBackup = (p) => {
    if (!exists(p)) return;
    fs.mkdirSync(backup, { recursive: true });
    const dest = path.join(backup, relName(p));
    if (exists(dest)) return; // keep the first copy if we back up the same thing twice in one second
    fs.cpSync(p, dest, { recursive: true });
  };
  ctx.writeText = (p, text, mode) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!(exists(p) && read(p) === text)) { ctx.saveBackup(p); fs.writeFileSync(p, text, "utf8"); }
    if (mode !== undefined && !IS_WIN) fs.chmodSync(p, mode);
  };
  ctx.fill = (text, lead = "", self = "") =>
    text.split("{{BIN}}").join(fwd(bin)).split("{{TEAM}}").join(fwd(team)).split("{{EXT}}").join(IS_WIN ? ".cmd" : "")
      .split("{LEAD}").join(lead).split("{SELF}").join(self);
  ctx.copyTree = (from, to) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const s = path.join(from, e.name), d = path.join(to, e.name);
      if (e.isDirectory()) ctx.copyTree(s, d); else ctx.writeText(d, ctx.fill(read(s)));
    }
  };
  ctx.readJsonFile = (p) => JSON.parse(read(p).replace(/^﻿/, ""));
  // Oldest install backup of this file (that is the state before we first touched it).
  ctx.originalBackup = (p) => {
    let dirs = [];
    try { dirs = fs.readdirSync(backupRoot).filter((n) => !n.endsWith("-uninstall")).sort(); } catch {}
    for (const d of dirs) { const f = path.join(backupRoot, d, relName(p)); if (exists(f) && fs.statSync(f).isFile()) return f; }
    return null;
  };
  ctx.pathEntries = () => ({ zsh: path.join(home, ".zshrc"), bash: path.join(home, ".bashrc") });
  ctx.psPath = (script) => spawnSync("powershell", ["-NoProfile", "-Command", script], { env: { ...process.env, AI_TEAM_BIN: bin }, encoding: "utf8", windowsHide: true });
  return ctx;
}

// Put `block` (with START/END marker lines) into file: replace our old block or append. Never touches other text.
function setBlock(ctx, file, block, re = BLOCK_RE) {
  const old = exists(file) ? read(file) : "";
  const eol = old.includes("\r\n") ? "\r\n" : "\n";
  const b = block.trim().replace(/\r?\n/g, eol);
  const next = re.test(old) ? old.replace(re, () => b) : (old.trimEnd() ? old.trimEnd() + eol + eol : "") + b + eol;
  ctx.writeText(file, next);
}

function parseArgs(argv) {
  const o = { mode: "pro", acceptAgyRisk: false, agyAuto: false, home: null, noPath: false };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--?([A-Za-z][\w-]*)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    const k = m[1].toLowerCase().replace(/-/g, ""), val = () => (m[2] !== undefined ? m[2] : argv[++i]);
    if (k === "mode") o.mode = String(val() || "").toLowerCase();
    else if (k === "home" || k === "homedir") o.home = val();
    else if (k === "acceptagyrisk") o.acceptAgyRisk = true;
    else if (k === "agyautoallowhelpers") o.agyAuto = true;
    else if (k === "nopath") o.noPath = true;
  }
  return o;
}
function resolveHome(opt) { return path.resolve(opt || process.env.AI_TEAM_HOME || os.homedir()); }

function install(argv) {
  const opt = parseArgs(argv);
  if (!MODES.includes(opt.mode)) { console.error(`ERROR: --mode must be one of ${MODES.join(", ")}`); return 1; }
  const home = resolveHome(opt.home);
  process.env.AI_TEAM_HOME = home; // core.js reads it
  const core = require("./lib/core.js");
  const ctx = makeCtx(home);
  const { team, bin, lib, done } = ctx;
  const Src = __dirname;
  const customHome = !ctx.realHome;
  const has = (dir, finder) => isDir(path.join(home, dir)) || (!customHome && !!finder());

  // 1. Helpers
  fs.mkdirSync(bin, { recursive: true });
  const NAMES = ["ask-gpt", "ask-gemini", "ask-claude", "ask-team", "set-team", "set-mode", "list-models"];
  for (const f of fs.readdirSync(path.join(Src, "lib"))) if (f.endsWith(".js")) ctx.writeText(path.join(lib, f), read(path.join(Src, "lib", f)));
  // leftovers of the old PowerShell layout
  if (exists(bin)) for (const f of fs.readdirSync(bin)) {
    if (/\.ps1$/.test(f) || f === "mentions-hook.js" || f === "agy-allow-helpers.js") { ctx.saveBackup(path.join(bin, f)); fs.rmSync(path.join(bin, f), { force: true }); }
  }
  for (const n of NAMES) {
    if (IS_WIN) ctx.writeText(path.join(bin, n + ".cmd"), `@node "%~dp0..\\lib\\${n}.js" %*\r\nexit /b %ERRORLEVEL%\r\n`);
    else ctx.writeText(path.join(bin, n), `#!/bin/sh\nexec node "$(dirname "$0")/../lib/${n}.js" "$@"\n`, 0o755);
  }
  ctx.writeText(path.join(team, "modes.json"), read(path.join(Src, "config", "modes.json")));
  if (!exists(path.join(team, "config.json"))) {
    spawnSync(process.execPath, [path.join(lib, "set-mode.js"), opt.mode], { env: { ...process.env, AI_TEAM_HOME: home }, stdio: "ignore", windowsHide: true });
  }
  if (opt.acceptAgyRisk) ctx.writeText(path.join(team, "allow-agy"), "");
  done.push(`helpers -> ${bin}`);

  if (!opt.noPath && ctx.realHome) {
    if (IS_WIN) {
      const r = ctx.psPath("$b=$env:AI_TEAM_BIN; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; if((($p -split ';') -notcontains $b)){[Environment]::SetEnvironmentVariable('Path',($p.TrimEnd(';')+';'+$b).TrimStart(';'),'User'); 'ADDED'}");
      if (/ADDED/.test(r.stdout || "")) done.push(`PATH: added ${bin} (open a new terminal)`);
    } else {
      const block = `# AI-TEAM PATH START\nexport PATH="$HOME/.ai-team/bin:$PATH"\n# AI-TEAM PATH END`;
      const { zsh, bash } = ctx.pathEntries();
      const targets = [];
      if (IS_MAC || exists(zsh)) targets.push(zsh);
      if (exists(bash)) targets.push(bash);
      for (const f of targets) {
        const before = exists(f) ? read(f) : null;
        setBlock(ctx, f, block, PATH_RE);
        if (before === null || !PATH_RE.test(before)) done.push(`PATH: added ${bin} to ${f} (open a new terminal)`);
      }
    }
  }

  const rules = read(path.join(Src, "rules", "rules-template.md"));

  // 2. Claude Code
  const claudeDir = path.join(home, ".claude");
  if (has(".claude", core.findClaude)) {
    ctx.copyTree(path.join(Src, "claude", "commands"), path.join(claudeDir, "commands"));
    setBlock(ctx, path.join(claudeDir, "CLAUDE.md"), ctx.fill(read(path.join(Src, "rules", "claude-section.md"))));
    const sp = path.join(claudeDir, "settings.json");
    let s = {}, ok = true;
    if (exists(sp)) { try { s = ctx.readJsonFile(sp); } catch { ok = false; done.push(`Claude: ${sp} is not valid JSON; left it alone (no status line / hook added)`); } }
    if (ok) {
      let changed = false;
      const statusCmd = `node "${fwd(lib)}/statusline.js"`;
      const cur = s.statusLine && typeof s.statusLine === "object" ? String(s.statusLine.command || "") : (s.statusLine ? String(s.statusLine) : "");
      if (!s.statusLine) { s.statusLine = { type: "command", command: statusCmd }; changed = true; }
      else if (/statusline\.ps1/.test(cur) && cur.includes(".ai-team")) { s.statusLine = { ...s.statusLine, command: statusCmd }; changed = true; }
      else if (!/statusline\.js/.test(cur) || !cur.includes(".ai-team")) done.push(`Claude: you already have a status line; kept it. Ours: ${statusCmd}`);
      const hookCmd = `node "${fwd(lib)}/mentions-hook.js"`;
      if (!s.hooks || typeof s.hooks !== "object") { s.hooks = {}; changed = true; }
      const ups = Array.isArray(s.hooks.UserPromptSubmit) ? s.hooks.UserPromptSubmit : (s.hooks.UserPromptSubmit ? [s.hooks.UserPromptSubmit] : []);
      if (!JSON.stringify(ups).includes("mentions-hook")) {
        ups.push({ hooks: [{ type: "command", command: hookCmd, timeout: 5 }] });
        s.hooks.UserPromptSubmit = ups; changed = true;
      } else {
        for (const e of ups) for (const h of (e && e.hooks) || []) {
          if (h && /mentions-hook/.test(h.command || "") && String(h.command).includes(".ai-team") && h.command !== hookCmd) { h.command = hookCmd; changed = true; }
        }
        if (changed) s.hooks.UserPromptSubmit = ups;
      }
      if (changed) ctx.writeText(sp, JSON.stringify(s, null, 2) + "\n");
    }
    done.push("Claude Code: /team /mode /gpt /gemini /claude /council, rules in CLAUDE.md, @mentions hook, status line");
  }

  // 3. Codex
  const codexDir = path.join(home, ".codex");
  if (has(".codex", core.findCodex)) {
    setBlock(ctx, path.join(codexDir, "AGENTS.md"), ctx.fill(rules, "GPT (running in Codex)", "you are GPT, so never call ask-gpt or ask-team for a role whose tool is gpt; do that part yourself."));
    ctx.copyTree(path.join(Src, "codex", "skills"), path.join(home, ".agents", "skills"));
    const toml = path.join(codexDir, "config.toml");
    const t = exists(toml) ? read(toml) : "";
    if (!/^\[sandbox_workspace_write\]/m.test(t)) {
      ctx.writeText(toml, (t.trimEnd() + `\n\n# AI team: helpers write their log/config here (no network, no full access)\n[sandbox_workspace_write]\nwritable_roots = ['${team}']\n`).trimStart());
    } else if (!t.includes(team)) {
      done.push(`Codex: add '${team}' to writable_roots under [sandbox_workspace_write] in config.toml yourself (that section already exists)`);
    }
    done.push("Codex: rules in ~/.codex/AGENTS.md, skills ai-team-* in ~/.agents/skills");
  }

  // 4. Antigravity
  const gemCfg = path.join(home, ".gemini", "config");
  if (has(".gemini", core.findAgy)) {
    const plug = path.join(gemCfg, "plugins", "ai-team");
    ctx.writeText(path.join(plug, "plugin.json"), '{ "name": "ai-team" }\n');
    ctx.writeText(path.join(plug, "rules", "AGENTS.md"), ctx.fill(rules, "Gemini (running in Antigravity)", "you are Gemini, so never call ask-gemini or ask-team for a role whose tool is gemini; do that part yourself."));
    ctx.copyTree(path.join(Src, "antigravity", "skills"), path.join(gemCfg, "skills"));
    if (opt.agyAuto) {
      const hook = { "ai-team-allow-helpers": { PreToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: `node "${fwd(lib)}/agy-allow-helpers.js"`, timeout: 5 }] }] } };
      ctx.writeText(path.join(plug, "hooks.json"), JSON.stringify(hook, null, 2) + "\n");
      done.push("Antigravity: helpers (only them) run without asking");
    }
    done.push("Antigravity: rules plugin ~/.gemini/config/plugins/ai-team, skills ai-team-*");
  }

  console.log(`AI team installed. Mode: ${opt.mode}`);
  for (const d of done) console.log(` - ${d}`);
  if (!exists(path.join(team, "allow-agy"))) console.log(" - Gemini helper is OFF. Read the README (Terms risk), then re-run with --accept-agy-risk to turn it on.");
  if (exists(ctx.backup)) console.log(` - backups: ${ctx.backup}`);
  console.log("Sign in once in your own terminal if you haven't: claude | codex (Sign in with ChatGPT) | agy (Google). Then run: node tests/smoke.js");
  return 0;
}

module.exports = { makeCtx, setBlock, parseArgs, resolveHome, BLOCK_RE, PATH_RE, fwd, read, exists, isDir, IS_WIN, IS_MAC };
if (require.main === module) {
  try { process.exitCode = install(process.argv.slice(2)); }
  catch (e) { console.error("ERROR: " + (e && e.message || e)); process.exitCode = 1; }
}
