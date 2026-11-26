#!/usr/bin/env node
// Removes what install.js added. Keeps your config.json, modes.json, log.csv and backups in ~/.ai-team, and all your own text.
// Every file it changes is backed up to ~/.ai-team/backup/<timestamp>-uninstall first.
//   node uninstall.js [--home <dir>]
"use strict";
const fs = require("fs");
const path = require("path");
const { makeCtx, parseArgs, resolveHome, BLOCK_RE, PATH_RE, fwd, read, exists, IS_WIN } = require("./install.js");

function main(argv) {
  const opt = parseArgs(argv);
  const home = resolveHome(opt.home);
  const ctx = makeCtx(home, "-uninstall");
  const { team, bin, lib } = ctx;
  const j = (...p) => path.join(home, ...p);
  const out = (m) => console.log(` - ${m}`);

  const removeOurs = (p) => { if (exists(p)) { ctx.saveBackup(p); fs.rmSync(p, { recursive: true, force: true }); out(`removed ${p}`); } };
  const rmdirIfEmpty = (p) => { try { fs.rmdirSync(p); } catch {} };
  // Write `text` to file; if it equals what the file was before we first touched it, put the original bytes back.
  // Empty result and no original → we created the file, so delete it.
  const writeBack = (p, text, same = (a, b) => a.trim() === b.trim()) => {
    const orig = ctx.originalBackup(p);
    ctx.saveBackup(p);
    if (orig) {
      const o = read(orig);
      if (same(o, text)) { fs.writeFileSync(p, o, "utf8"); return; }
    } else if (!text.trim()) { fs.rmSync(p, { force: true }); return; }
    fs.writeFileSync(p, text, "utf8");
  };
  const removeBlock = (p, re, label) => {
    if (!exists(p)) return;
    const t = read(p);
    if (!re.test(t)) return;
    const eol = t.includes("\r\n") ? "\r\n" : "\n";
    const rest = t.replace(new RegExp("\\s*" + re.source + "\\s*"), eol + eol).trim();
    writeBack(p, rest ? rest.replace(/\r?\n/g, eol) + eol : "");
    out(`removed ${label} from ${p}`);
  };

  // Claude Code
  const c = j(".claude");
  for (const n of ["team", "mode", "gpt", "gemini", "claude", "council", "swarm", "loop", "graph"]) {
    const f = path.join(c, "commands", n + ".md");
    if (!exists(f)) continue;
    const txt = read(f), src = path.join(__dirname, "claude", "commands", n + ".md");
    const mine = txt.includes(fwd(bin)) || txt.includes(bin) ||
      (exists(src) && txt.trim() === ctx.fill(read(src)).trim());
    if (mine) removeOurs(f);
  }
  rmdirIfEmpty(path.join(c, "commands"));
  removeBlock(path.join(c, "CLAUDE.md"), BLOCK_RE, "AI team block");
  const sp = path.join(c, "settings.json");
  if (exists(sp)) {
    let s = null;
    try { s = ctx.readJsonFile(sp); } catch { out(`${sp} is not valid JSON; left it alone`); }
    if (s && typeof s === "object") {
      let ch = false;
      const sl = s.statusLine && typeof s.statusLine === "object" ? String(s.statusLine.command || "") : "";
      if (sl && (sl.includes(fwd(lib) + "/statusline.js") || sl.includes(lib + path.sep + "statusline.js") || (sl.includes(".ai-team") && /statusline\.(js|ps1)/.test(sl)))) { delete s.statusLine; ch = true; }
      const ups = s.hooks && s.hooks.UserPromptSubmit;
      if (ups) {
        const arr = Array.isArray(ups) ? ups : [ups];
        const keep = arr.filter((e) => !JSON.stringify(e).includes("mentions-hook"));
        if (keep.length !== arr.length) {
          ch = true;
          if (keep.length) s.hooks.UserPromptSubmit = keep; else delete s.hooks.UserPromptSubmit;
          if (!Object.keys(s.hooks).length) delete s.hooks;
        }
      }
      if (ch) {
        const same = (a, b) => { try { return JSON.stringify(JSON.parse(a.replace(/^﻿/, ""))) === JSON.stringify(JSON.parse(b)); } catch { return false; } };
        writeBack(sp, Object.keys(s).length ? JSON.stringify(s, null, 2) + "\n" : "", same);
        out(`removed status line and @mentions hook from ${sp}`);
      }
    }
  }

  // Codex
  removeBlock(j(".codex", "AGENTS.md"), BLOCK_RE, "AI team block");
  const skillDirs = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith("ai-team-")).map((e) => path.join(dir, e.name)); } catch { return []; } };
  for (const d of skillDirs(j(".agents", "skills"))) removeOurs(d);
  rmdirIfEmpty(j(".agents", "skills")); rmdirIfEmpty(j(".agents"));
  const toml = j(".codex", "config.toml");
  if (exists(toml)) {
    const t = read(toml);
    const esc = team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ours = new RegExp("\\s*# AI team: helpers write their log/config here[^\\n]*\\r?\\n\\[sandbox_workspace_write\\]\\s*\\r?\\nwritable_roots = \\['" + esc + "'\\]\\s*");
    if (ours.test(t)) {
      const rest = t.replace(ours, "\n").trimEnd();
      writeBack(toml, rest ? rest + "\n" : "");
      out(`removed sandbox entry from ${toml}`);
    } else if (t.includes(team)) out(`${toml} still lists ${team} in writable_roots (edited by hand?): remove it yourself if you want`);
  }

  // Antigravity
  removeOurs(j(".gemini", "config", "plugins", "ai-team"));
  for (const d of skillDirs(j(".gemini", "config", "skills"))) removeOurs(d);
  rmdirIfEmpty(j(".gemini", "config", "plugins")); rmdirIfEmpty(j(".gemini", "config", "skills"));

  // Helpers and PATH
  removeOurs(bin);
  removeOurs(lib);
  removeOurs(path.join(team, "allow-agy"));
  if (ctx.realHome) {
    if (IS_WIN) {
      const r = ctx.psPath("$b=$env:AI_TEAM_BIN; $p=[Environment]::GetEnvironmentVariable('Path','User'); if($p){$np=(($p -split ';') | Where-Object { $_ -and $_ -ne $b }) -join ';'; if($np -ne $p){[Environment]::SetEnvironmentVariable('Path',$np,'User'); 'REMOVED'}}");
      if (/REMOVED/.test(r.stdout || "")) out(`removed ${bin} from PATH`);
    } else {
      for (const f of Object.values(ctx.pathEntries())) removeBlock(f, PATH_RE, "AI team PATH block");
    }
  }
  console.log(`AI team removed. Kept: ${team} (config.json, modes.json, log.csv, backups).`);
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (e) { console.error("ERROR: " + (e && e.message || e)); process.exitCode = 1; }
