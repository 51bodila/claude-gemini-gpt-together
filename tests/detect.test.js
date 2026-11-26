"use strict";
const H = require("./helpers"); // sets AI_TEAM_HOME first
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../lib/core");
const D = require("../lib/detect-models");

const author = JSON.parse(fs.readFileSync(path.join(H.FIX, "lists-author.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));

// every model a pick names must exist in the list for its tool (claude: opus/sonnet/haiku aliases)
function assertExisting(modes, lists) {
  for (const mode of ["eco", "pro", "max"]) for (const [role, r] of Object.entries(modes[mode])) {
    const where = `${mode}.${role}`;
    if (r.tool === "gpt") {
      const m = lists.gpt.find((x) => x.id === r.model);
      assert.ok(m, where + " gpt model exists: " + r.model);
      assert.ok(!r.effort || m.efforts.includes(r.effort), where + " effort listed: " + r.effort);
    } else if (r.tool === "gemini") assert.ok(lists.gemini.some((x) => x.name === r.model), where + " gemini model exists: " + r.model);
    else if (r.tool === "claude") assert.ok(lists.claude.some((x) => x.id === r.model), where + " claude alias exists: " + r.model);
    else assert.fail("unknown tool " + r.tool);
  }
}

test("author machine: picks the same models as config/modes.json", () => {
  const m = D.chooseModes(author);
  assertExisting(m, author);
  const tpl = core.readJson(path.join(H.ROOT, "config", "modes.json"), {});
  assert.deepEqual(m, tpl);
});

test("ChatGPT-only person: Claude and Gemini roles move to gpt", () => {
  const l = { gpt: author.gpt, gemini: [], gemini_locked: [], claude: [] };
  const m = D.chooseModes(l);
  assertExisting(m, l);
  for (const mode of ["eco", "pro", "max"]) for (const r of Object.values(m[mode])) assert.equal(r.tool, "gpt");
  assert.equal(m.pro.advisor.model, "gpt-6.2-astra");
  assert.equal(m.pro.designer.tool, "gpt");
});

test("only Gemini Flash exists: advisor uses it in every mode, never a missing model", () => {
  const l = { gpt: author.gpt, gemini: author.gemini.filter((g) => g.name.startsWith("Gemini 3.8 Flash")), gemini_locked: author.gemini_locked, claude: author.claude };
  const m = D.chooseModes(l);
  assertExisting(m, l);
  assert.equal(m.eco.advisor.model, "Gemini 3.8 Flash (Low)");
  assert.equal(m.pro.advisor.model, "Gemini 3.8 Flash (High)");
  assert.equal(m.max.advisor.model, "Gemini 3.8 Flash (High)");
  const noLow = { ...l, gemini: l.gemini.filter((g) => !g.name.includes("(Low)")) };
  assert.equal(D.chooseModes(noLow).eco.advisor.model, "Gemini 3.8 Flash (Medium)");
});

test("no codex: builder and reviewer go to claude, gemini still advises", () => {
  const l = { gpt: [], gemini: author.gemini, gemini_locked: author.gemini_locked, claude: author.claude };
  const m = D.chooseModes(l);
  assertExisting(m, l);
  for (const mode of ["eco", "pro", "max"]) {
    assert.equal(m[mode].builder.tool, "claude");
    assert.equal(m[mode].reviewer.tool, "claude");
    assert.equal(m[mode].advisor.tool, "gemini");
    assert.equal(m[mode].designer.tool, "claude");
  }
  assert.equal(m.pro.builder.model, "opus");
});

test("gemini only: no builder (gemini cannot build), advisor present", () => {
  const m = D.chooseModes({ gpt: [], gemini: author.gemini, gemini_locked: [], claude: [] });
  assert.equal(m.pro.builder, undefined);
  assert.equal(m.pro.advisor.tool, "gemini");
});

test("GPT list with no 'most capable' text: first listed is strongest, cheapest falls back to everyday", () => {
  const gpt = [
    { id: "x-1", name: "X1", about: "A model.", efforts: ["low", "medium", "high"] },
    { id: "x-2", name: "X2", about: "Another model.", efforts: ["low", "medium"] },
  ];
  const l = { gpt, gemini: [], gemini_locked: [], claude: [] };
  const m = D.chooseModes(l);
  assertExisting(m, l);
  assert.equal(m.pro.builder.model, "x-1");
  assert.equal(m.pro.builder.effort, "high");
  assert.equal(m.max.builder.effort, "high"); // xhigh not listed: highest listed below it
  assert.equal(m.eco.builder.model, "x-1");
});

test("efforts: never an unlisted level; luna has no ultra and still works", () => {
  assert.equal(D.effortFor(["low", "medium", "high", "xhigh", "max"], "xhigh"), "xhigh");
  assert.equal(D.effortFor(["low", "medium"], "xhigh"), "medium");
  assert.equal(D.effortFor(["high", "xhigh"], "low"), "high");
  assert.equal(D.effortFor([], "high"), "");
});

test("locked Gemini models are never chosen", () => {
  const l = { gpt: [], gemini: [{ id: "n", name: "Gemini 4 Neon (High)" }, ...author.gemini], gemini_locked: author.gemini_locked, claude: [] };
  assert.equal(D.chooseModes(l).pro.advisor.model, "Gemini 4 Hydrogen (High)");
});

test("probing: a failing model is replaced by the next candidate; a dead tool is dropped", async () => {
  const seen = [];
  const prober = async (tool, model) => { seen.push(model); return { ok: !(model === "gpt-6.2-astra"), reason: "nope" }; };
  const r = await D.chooseAndProbe(author, { probe: true, prober });
  assertExisting(r.modes, author);
  assert.notEqual(r.modes.pro.builder.model, "gpt-6.2-astra");
  assert.ok(r.notes.some((n) => /gpt-6.2-astra/.test(n)));
  const dead = await D.chooseAndProbe(author, { probe: true, prober: async (tool) => ({ ok: tool !== "gpt", reason: "x" }) });
  assert.equal(dead.modes.pro.builder.tool, "claude");
});

test("detectModes --write saves modes.json and re-applies an eco/pro/max mode", async () => {
  H.resetTeam();
  core.saveConfig({ mode: "pro", roles: core.DEFAULT_ROLES });
  const r = await D.detectModes({ lists: { gpt: [{ id: "x-1", about: "A model.", efforts: ["high"] }], gemini: [], gemini_locked: [], claude: [] }, probe: false, write: true });
  assert.ok(fs.existsSync(core.MODES));
  assert.equal(core.readConfig().roles.builder.model, "x-1");
  assert.match(r.text, /x-1/);
  core.saveConfig({ mode: "custom", roles: core.DEFAULT_ROLES });
  await D.detectModes({ lists: { gpt: [{ id: "y-1", about: "A.", efforts: ["high"] }], gemini: [], gemini_locked: [], claude: [] }, probe: false, write: true });
  assert.equal(core.readConfig().roles.builder.model, "");
});
