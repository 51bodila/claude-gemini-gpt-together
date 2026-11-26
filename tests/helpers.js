// Shared test setup. Require this FIRST in every test file: it points AI_TEAM_HOME at a fresh temp dir.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ai-team-test-"));
process.env.AI_TEAM_HOME = HOME;
const TEAM = path.join(HOME, ".ai-team");
const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "lib");
const FIX = path.join(__dirname, "fixtures");

function tmp(prefix = "t") { return fs.mkdtempSync(path.join(os.tmpdir(), "ai-team-" + prefix + "-")); }
function resetTeam() { fs.rmSync(TEAM, { recursive: true, force: true }); }

// Fake CLIs are plain node scripts; core runs AI_TEAM_<X>=<file>.js as `node <file>`.
function makeFake(name, body) {
  const f = path.join(tmp("fake"), name + ".js");
  fs.writeFileSync(f, body, "utf8");
  return f;
}

process.on("exit", () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} });
module.exports = { HOME, TEAM, ROOT, LIB, FIX, tmp, resetTeam, makeFake };
