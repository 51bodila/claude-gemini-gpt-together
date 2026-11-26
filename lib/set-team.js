#!/usr/bin/env node
// set-team: give a role to a model, after one probe call proves the model answers.
//   set-team builder gpt-6.2-astra [-Effort high]     set-team advisor "Gemini 4 Hydrogen (High)"
//   set-team designer opus                            set-team builder opus  (any role -> any tool; tool guessed from the name)
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");
const core = require("./core");

const ROLES = ["builder", "reviewer", "advisor", "designer"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];
const { flags, opts, rest } = core.parseArgs(process.argv.slice(2), { flags: ["noprobe", "no-probe"], options: ["effort", "tool"] });
const [role, model] = rest;
let tool = (opts.tool || "").toLowerCase();
let effort = (opts.effort || "").toLowerCase();

function done(msg, code) { core.finish(msg, code); }
if (!ROLES.includes(String(role).toLowerCase()) || !model) done("NOT SAVED: usage: set-team <builder|reviewer|advisor|designer> <model> [-Effort level] [-Tool gpt|gemini|claude]", 1);
else {
  if (!tool) {
    if (/\(/.test(model)) tool = "gemini";                 // agy display names, e.g. "Claude Opus 4.6 (Thinking)", run through Antigravity
    else if (/^(gpt-|o\d)/i.test(model)) tool = "gpt";
    else if (/^gemini/i.test(model)) tool = "gemini";
    else if (/^(claude|opus|sonnet|haiku|fable)/i.test(model)) tool = "claude";
  }
  if (!["gpt", "gemini", "claude"].includes(tool)) done(`NOT SAVED: can't tell which app runs '${model}'. Add -Tool gpt|gemini|claude.`, 1);
  else {
    if (tool !== "gpt") effort = "";
    if (effort && !EFFORTS.includes(effort)) done("NOT SAVED: effort must be one of " + EFFORTS.join(", "), 1);
    else {
      if (!(flags.noprobe || flags["no-probe"])) {
        const helper = path.join(__dirname, { gpt: "ask-gpt.js", gemini: "ask-gemini.js", claude: "ask-claude.js" }[tool]);
        const args = [helper, "-Role", "probe", "-Model", model];
        if (tool === "gpt") args.push("-Review", "-TimeoutMin", "5");
        if (effort) args.push("-Effort", effort);
        if (tool === "gemini") args.push("-TimeoutSec", "180");
        if (tool === "claude") args.push("-TimeoutMin", "5");
        const tmp = require("os").tmpdir();
        args.push(tmp, "Reply with exactly: OK");
        const r = spawnSync(process.execPath, args, { encoding: "utf8", input: "", env: { ...process.env, AI_TEAM_ALLOW_SELF: "1" }, timeout: 6 * 60 * 1000, windowsHide: true });
        const out = ((r.stdout || "") + (r.stderr || "")).trim();
        if (r.status !== 0 || /^\s*(ERROR|LIMIT)/m.test(out) || !/\bOK\b/i.test(out)) {
          return done(`NOT SAVED: '${model}' did not answer the test call: ` + out.split(/\r?\n/).slice(0, 2).join(" "), 1);
        }
      }
      const cfg = core.readConfig();
      cfg.roles[role.toLowerCase()] = { tool, model, effort };
      if (cfg.mode !== "solo") cfg.mode = "custom";
      core.saveConfig(cfg);
      done(`SAVED: ${role.toLowerCase()} = ${model} (${tool})${effort ? ", " + effort : ""}`, 0);
    }
  }
}
