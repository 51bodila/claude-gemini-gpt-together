#!/usr/bin/env node
// ask-team: send a task to whoever plays a role now (config.json).
// Usage: ask-team <builder|reviewer|advisor|designer> [folder] "task"
"use strict";
const path = require("path");
const { spawn } = require("child_process");
const core = require("./core");

const ROLES = ["builder", "reviewer", "advisor", "designer"];
const argv = process.argv.slice(2);
const role = argv.shift();
if (!ROLES.includes(role)) core.finish(`ERROR: role must be one of ${ROLES.join(", ")}. Usage: ask-team <role> [folder] "task"`, 4);
else {
  const cfg = core.readConfig();
  if (cfg.mode === "solo") core.finish("SOLO: the team is in solo mode. Do it yourself (the user can name a model to override).", 8);
  else {
    const r = cfg.roles[role];
    if (!r) core.finish(`ERROR: role ${role} is not set. Use /team.`, 4);
    else {
      const pre = ["-Role", role];
      if (r.model) pre.push("-Model", r.model);
      let file;
      if (r.tool === "gpt") {
        file = "ask-gpt.js";
        if (r.effort) pre.push("-Effort", r.effort);
        if (role !== "builder") pre.push("-Review");
      } else if (r.tool === "gemini") file = "ask-gemini.js";
      else if (r.tool === "claude") {
        file = "ask-claude.js";
        if (role === "builder" || role === "designer") pre.push("-Build");
      }
      if (!file) core.finish(`ERROR: unknown tool '${r.tool}' for role ${role}`, 4);
      else {
        const child = spawn(process.execPath, [path.join(__dirname, file), ...pre, ...argv], { stdio: "inherit", windowsHide: true });
        child.on("error", (e) => core.finish(`ERROR: cannot start ${file}: ${e.message}`, 1));
        child.on("close", (code) => process.exit(code ?? 1));
      }
    }
  }
}
