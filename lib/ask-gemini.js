// ask-gemini: ask Gemini through the Antigravity CLI (agy) on the Google account subscription (no API key).
// Read-only adviser. Usage: node lib/ask-gemini.js [-Model "..."] [-Role r] [-TimeoutSec n] [--task-file f] [<folder>] "task"
// agy -p cannot read the prompt from stdin ("-p -" is taken literally), so the prompt goes as an argument (no shell, byte-exact).
"use strict";
const fs = require("fs");
const path = require("path");
const core = require("./core");

function pjson(out) {
  const lines = String(out || "").split(/\r?\n/).filter((l) => l.trimStart().startsWith('{"'));
  for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch {} }
  return null;
}

(async () => {
  const { opts, rest } = core.parseArgs(process.argv.slice(2), { flags: [], options: ["model", "role", "timeout-sec", "task-file"] });
  const role = opts.role || "advisor";
  const timeoutSec = parseInt(opts["timeout-sec"], 10) || 900;

  if (!fs.existsSync(path.join(core.TEAM, "allow-agy"))) {
    return core.finish("ERROR: Gemini via Antigravity CLI is paused (file ~/.ai-team/allow-agy is missing). Google staff said calling agy -p from other agents on consumer plans may break Antigravity Terms. To accept that risk, create the file ~/.ai-team/allow-agy.", 5);
  }
  const dt = core.dirTask(rest, opts);
  if (dt.missingDir) return core.finish(`ERROR: folder not found: ${dt.dir}`, 4);
  if (!dt.task) return core.finish('ERROR: no task. Usage: ask-gemini [folder] "task"', 4);
  const dir = dt.dir, task = dt.task;
  const model = opts.model || core.toolDefault(core.readConfig(), "gemini", role).model || "";

  const agy = core.findAgy();
  if (!agy) return core.finish("ERROR: Antigravity CLI (agy) is not installed. Windows: irm https://antigravity.google/cli/install.ps1 | iex   macOS/Linux: see https://antigravity.google/cli", 2);
  if (!fs.existsSync(dir)) return core.finish(`ERROR: folder not found: ${dir}`, 4);

  const prompt = "You are a read-only adviser. Do not create, edit, move or delete any files and do not run commands that change anything. Answer directly in plain text. Use no tools unless the task asks you to read a file; never run shell commands. Mark anything you are not sure about as 'guess'. " + task;
  const args = [...agy.pre, "-p", prompt, "--output-format", "json", "--print-timeout", `${timeoutSec}s`, "--mode", "plan"];
  if (model) args.push("--model", model);

  const start = Date.now();
  let status = "failed", code = 1, out = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await core.run({ cmd: agy.cmd, args, cwd: dir, timeoutMs: (timeoutSec + 60) * 1000 });
    code = r.code;
    if (r.timedOut) { status = "timeout"; out = `ERROR: Gemini (${model}) gave no answer in ${Math.round(timeoutSec / 60)} min (tried ${attempt} times). Do the work yourself and tell the user.`; continue; }
    const j = pjson(r.out);
    if (/authentication required|not signed in|please log ?in/i.test(r.out)) { status = "failed"; code = 3; out = "ERROR: Antigravity CLI is not signed in. Run 'agy' once in a terminal and sign in with Google."; break; }
    if (j && j.status === "ERROR") {
      const e = String(j.error || "");
      const el = e.split("\n");
      const first = el[0].trim();
      const models = el.slice(1).filter((l) => /^\s{2,}\S/.test(l)).map((l) => l.trim()).join(", ");
      if (core.isLimit(e)) {
        if (attempt < 2) { await core.sleep(20000); continue; }
        status = "limit"; code = 6; out = `LIMIT: Gemini plan limit reached (${model}). Give this role to another model with /team and tell the user. ${first}`; break;
      }
      out = "ERROR: " + first + (models ? `. Models on your plan: ${models}` : "");
      if (/invalid model|unavailable/i.test(e)) break;
    } else if (j && !String(j.response || "").trim() && j.denied_actions && j.denied_actions.length) {
      out = "ERROR: Gemini tried a blocked action (" + j.denied_actions.map((d) => d.display_name).join(", ") + ") and gave no answer.";
    } else if (j && j.response && String(j.response).trim()) {
      status = "done"; code = 0; out = String(j.response).trim(); break;
    } else if (core.isLimit(r.out)) {
      if (attempt < 2) { await core.sleep(20000); continue; }
      const hit = String(r.out).split("\n").find((l) => /limit|quota|exhausted|429/i.test(l)) || "";
      status = "limit"; code = 6; out = `LIMIT: Gemini plan limit reached (${model}). Give this role to another model with /team and tell the user. ${hit.trim()}`; break;
    } else {
      out = `ERROR: Gemini returned nothing (exit ${code}). ` + core.lastLines(r.out || r.err, 2).replace(/ \| /g, " | ");
    }
    if (attempt < 2) await core.sleep(5000);
  }
  core.log({ tool: "gemini", role, model, effort: "", seconds: (Date.now() - start) / 1000, status, task });
  if (status === "done") return core.finish(out, 0);
  core.finish(out, code === 0 ? 1 : code);
})();
