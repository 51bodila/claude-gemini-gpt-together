#!/usr/bin/env node
// detect-models: build eco/pro/max from the models this person's plans really offer, prove each with one tiny call.
//   node lib/detect-models.js [--no-probe] [--write]
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const core = require("./core");

const LEGACY = /previous|legacy/i;
const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "ultra"];

// ---------- pure choosing logic (no CLI calls) ----------
// Highest level the model lists that is <= want; if want is below everything listed, the lowest listed.
function effortFor(efforts, want) {
  if (!efforts || !efforts.length) return "";
  const w = EFFORT_ORDER.indexOf(want);
  let best = "";
  for (const e of efforts) {
    const i = EFFORT_ORDER.indexOf(e);
    if (i >= 0 && i <= w && (!best || i > EFFORT_ORDER.indexOf(best))) best = e;
  }
  if (best) return best;
  return efforts.slice().sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b))[0];
}

function gptPicks(list) {
  const gpt = (list || []).filter((m) => m && m.id);
  if (!gpt.length) return null;
  const fresh = gpt.filter((m) => !LEGACY.test(m.about || ""));
  const strongest = gpt.find((m) => /most capable|complex/i.test(m.about || "") && !LEGACY.test(m.about || "")) || gpt[0];
  const everyday = fresh[0] || gpt[0];
  const cheapRe = /affordable|easier|simpler|mini|fast and/i;
  const cheapest = fresh.find((m) => cheapRe.test(m.about || "")) || gpt.find((m) => cheapRe.test(m.about || "")) || everyday;
  return { strongest, everyday, cheapest };
}

function geminiPicks(list, locked) {
  const lockedNames = (locked || []).map((l) => l.name);
  const items = [];
  for (const g of list || []) {
    if (!g || !g.name || lockedNames.some((n) => g.name.startsWith(n))) continue;
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(g.name);
    items.push({ name: g.name, family: m ? m[1] : g.name, level: m ? m[2] : "" });
  }
  const gem = items.filter((i) => /^Gemini/i.test(i.name));
  if (!gem.length) return null;
  const fam = gem[0].family;
  const inFam = gem.filter((i) => i.family === fam);
  const lvl = (arr, l) => arr.find((i) => i.level.toLowerCase() === l);
  const max = (lvl(inFam, "xhigh") || lvl(inFam, "high") || inFam[0]).name;
  const pro = (lvl(inFam, "high") || inFam[0]).name;
  const flash = gem.filter((i) => /flash/i.test(i.family));
  const eco = flash.length ? (lvl(flash, "low") || lvl(flash, "medium") || { name: pro }).name : pro;
  return { max, pro, eco };
}

// lists = { gpt:[{id,about,efforts}], gemini:[{name}], gemini_locked:[{name}], claude:[{id}] } -> { eco, pro, max } (schema of config/modes.json)
function chooseModes(lists) {
  const g = gptPicks(lists.gpt), m = geminiPicks(lists.gemini, lists.gemini_locked);
  const hasClaude = !!(lists.claude && lists.claude.length);
  const spec = {
    eco: { gpt: g && { pick: g.cheapest, b: "medium", r: "medium" }, gem: m && m.eco, claude: "sonnet", designer: "haiku", advGpt: g && { pick: g.cheapest, e: "medium" } },
    pro: { gpt: g && { pick: g.strongest, b: "high", r: "medium" }, gem: m && m.pro, claude: "opus", designer: "opus", advGpt: g && { pick: g.strongest, e: "medium" } },
    max: { gpt: g && { pick: g.strongest, b: "xhigh", r: "xhigh" }, gem: m && m.max, claude: "opus", designer: "opus", advGpt: g && { pick: g.strongest, e: "high" } },
  };
  const out = { eco: {}, pro: {}, max: {} };
  for (const mode of ["eco", "pro", "max"]) {
    const s = spec[mode], roles = out[mode];
    const gptRole = (pick, e) => ({ tool: "gpt", model: pick.id, effort: effortFor(pick.efforts, e) });
    const claudeRole = (model) => ({ tool: "claude", model, effort: "" });
    // builder / reviewer: gpt -> claude (gemini only advises)
    if (s.gpt) { roles.builder = gptRole(s.gpt.pick, s.gpt.b); roles.reviewer = gptRole(s.gpt.pick, s.gpt.r); }
    else if (hasClaude) { roles.builder = claudeRole(s.claude); roles.reviewer = claudeRole(s.claude); }
    // advisor: gemini -> gpt (review) -> claude
    if (s.gem) roles.advisor = { tool: "gemini", model: s.gem, effort: "" };
    else if (s.advGpt) roles.advisor = gptRole(s.advGpt.pick, s.advGpt.e);
    else if (hasClaude) roles.advisor = claudeRole(s.claude);
    // designer: claude -> gpt
    if (hasClaude) roles.designer = claudeRole(s.designer);
    else if (s.gpt) roles.designer = gptRole(s.gpt.pick, s.gpt.b);
  }
  return out;
}

// ---------- probing ----------
async function probeOne(tool, model, teamDir) {
  const script = path.join(__dirname, "ask-" + tool + ".js");
  const prev = process.env.AI_TEAM_ALLOW_SELF;
  process.env.AI_TEAM_ALLOW_SELF = "1"; // core.run copies process.env
  const r = await core.run({
    // -Review: GPT probes run read-only (no write access anywhere just to answer OK)
    cmd: process.execPath, args: [script, "-Role", "probe", "-Model", model, ...(tool === "gpt" ? ["-Review"] : []), os.tmpdir(), "Reply with exactly: OK"],
    timeoutMs: 4 * 60 * 1000,
  });
  if (prev === undefined) delete process.env.AI_TEAM_ALLOW_SELF; else process.env.AI_TEAM_ALLOW_SELF = prev;
  const text = (r.out || "") + "\n" + (r.err || "");
  if (/^LIMIT:/m.test(r.out || "")) return { ok: true, note: "plan limit reached right now" };
  const ok = r.code === 0 && !/^ERROR/m.test(r.out || "") && /\bOK\b/i.test(r.out || "");
  return { ok, reason: ok ? "" : core.lastLines(text, 2).slice(0, 160) };
}

function without(lists, tool, model) {
  const l = { ...lists };
  if (tool === "gpt") l.gpt = (lists.gpt || []).filter((x) => x.id !== model);
  else if (tool === "gemini") l.gemini = (lists.gemini || []).filter((x) => x.name !== model);
  else if (tool === "claude") l.claude = (lists.claude || []).filter((x) => x.id !== model);
  return l;
}
function distinct(modes) {
  const seen = new Map();
  for (const mode of Object.values(modes)) for (const r of Object.values(mode)) seen.set(r.tool + "|" + r.model, { tool: r.tool, model: r.model });
  return [...seen.values()];
}

// Choose, probe each distinct model once, drop the ones that fail and choose again (the next candidate takes over).
async function chooseAndProbe(lists, { probe = true, teamDir = core.TEAM, prober = probeOne } = {}) {
  const notes = [], cache = new Map();
  let cur = lists;
  let modes = chooseModes(cur);
  if (!probe) return { modes, notes };
  const verify = async (d) => {
    const key = d.tool + "|" + d.model;
    if (!cache.has(key)) cache.set(key, await prober(d.tool, d.model, teamDir));
    return cache.get(key);
  };
  const say = (n) => { if (!notes.includes(n)) notes.push(n); };
  for (let round = 0; round < 3; round++) { // first choice + at most 2 fallbacks
    let failed = false;
    for (const d of distinct(modes)) {
      const res = await verify(d);
      if (!res.ok) { failed = true; say(`${d.tool} ${d.model} did not answer (${res.reason || "no reason"}); using the next one`); cur = without(cur, d.tool, d.model); }
      else if (res.note) say(`${d.model}: ${res.note}`);
    }
    modes = chooseModes(cur);
    if (!failed) return { modes, notes };
  }
  // still failing: fall back to any model of that tool that did answer, else drop the tool
  for (const d of distinct(modes)) {
    if ((await verify(d)).ok) continue;
    const good = [...cache].find(([k, v]) => v.ok && k.startsWith(d.tool + "|"));
    if (good) {
      const to = good[0].slice(d.tool.length + 1);
      for (const mode of Object.values(modes)) for (const r of Object.values(mode)) if (r.tool === d.tool && r.model === d.model) { r.model = to; if (d.tool === "gpt") { const m = (lists.gpt || []).find((x) => x.id === to); r.effort = effortFor(m && m.efforts, r.effort || "medium"); } }
      say(`${d.tool}: ${d.model} failed, using ${to} instead`);
    } else { cur = { ...cur, [d.tool]: [] }; say(`${d.tool}: no working model found, its roles moved to another tool`); modes = chooseModes(cur); }
  }
  return { modes, notes };
}

function formatTable(modes, notes = []) {
  const roles = ["builder", "reviewer", "advisor", "designer"];
  const cell = (r) => (r ? `${r.tool}:${r.model}${r.effort ? " " + r.effort : ""}` : "-");
  const rows = [["role", "eco", "pro", "max"], ...roles.map((r) => [r, cell(modes.eco[r]), cell(modes.pro[r]), cell(modes.max[r])])];
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  const lines = rows.map((r) => r.map((c, i) => c.padEnd(w[i])).join("  ").trimEnd());
  return [...lines, ...notes.map((n) => "note: " + n)].join("\n");
}

async function detectModes(opts = {}) {
  const lists = opts.lists || await require("./list-models").listModels();
  const { modes, notes } = await chooseAndProbe(lists, { probe: opts.probe !== false, prober: opts.prober });
  const used = distinct(modes);
  const missing = ["gpt", "gemini", "claude"].filter((t) => !used.some((d) => d.tool === t));
  if (missing.length) notes.push("no role uses: " + missing.join(", ") + " (not installed, not signed in, or no usable model)");
  if (opts.write) {
    core.writeJson(core.MODES, modes);
    const cfg = core.readConfig();
    if (["eco", "pro", "max"].includes(cfg.mode)) {
      for (const [role, v] of Object.entries(modes[cfg.mode])) cfg.roles[role] = { tool: v.tool, model: v.model || "", effort: v.effort || "" };
      core.saveConfig(cfg);
      notes.push(`saved ${core.MODES}; mode ${cfg.mode} re-applied`);
    } else notes.push(`saved ${core.MODES}; current mode ${cfg.mode} left alone`);
  }
  return { modes, notes, text: formatTable(modes, notes) };
}

if (require.main === module) {
  const a = process.argv.slice(2);
  detectModes({ probe: !a.includes("--no-probe"), write: a.includes("--write") })
    .then((r) => core.finish(r.text, 0))
    .catch((e) => core.finish("ERROR: " + ((e && e.message) || e), 1));
}
module.exports = { detectModes, chooseModes, chooseAndProbe, gptPicks, geminiPicks, effortFor, formatTable };
