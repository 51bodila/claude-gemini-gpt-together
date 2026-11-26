// Runs every tests/*.test.js with the node test runner. Works on Node 18 and newer on every OS
// (Node 18 does not expand globs or directories for `node --test`).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.js")).sort().map((f) => path.join(__dirname, f));
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status === null ? 1 : r.status);
