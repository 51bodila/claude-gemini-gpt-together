#!/usr/bin/env node
// set-mode: switch the whole team at once.  Usage: set-mode eco|pro|max|solo
"use strict";
const fs = require("fs");
const path = require("path");
const core = require("./core");

const mode = String(process.argv[2] || "").toLowerCase();
if (!["eco", "pro", "max", "solo"].includes(mode)) core.finish("ERROR: usage: set-mode eco|pro|max|solo", 4);
else {
  const cfg = core.readConfig();
  if (mode !== "solo") {
    const file = fs.existsSync(core.MODES) ? core.MODES : path.join(__dirname, "..", "config", "modes.json");
    const preset = (core.readJson(file, {}) || {})[mode] || {};
    for (const [role, v] of Object.entries(preset)) cfg.roles[role] = { tool: v.tool, model: v.model || "", effort: v.effort || "" };
  }
  cfg.mode = mode;
  core.saveConfig(cfg);
  core.finish(mode === "solo"
    ? "SAVED: solo. The lead works alone; teammates only when the user names one."
    : `SAVED: ${mode}. ` + Object.entries(cfg.roles).map(([r, v]) => `${r}=${v.model || "default"}${v.effort ? " " + v.effort : ""}`).join("; "), 0);
}
