// ask-gpt: hand a task to GPT through Codex CLI, on the ChatGPT subscription (no API key).
//   node lib/ask-gpt.js [-Review] [-Model id] [-Effort e] [-Role r] [-TimeoutMin n] [--task-file f] [<folder>] "task"
// Never runs with full access. Prompt goes on stdin (codex exec ... -), so any characters arrive byte-exact.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const core = require("./core");

function say(text, code) { core.finish(text, code); }

async function main() {
  const { flags, opts, rest } = core.parseArgs(process.argv.slice(2), {
    flags: ["review"],
    options: ["model", "effort", "role", "timeout-min", "task-file"],
  });
  const review = !!flags.review;
  let dt;
  try { dt = core.dirTask(rest, opts); } catch (e) { return say("ERROR: cannot read task: " + e.message, 4); }
  const task = dt.task;
  if (!task) return say('ERROR: no task. Usage: ask-gpt <folder> "task"', 4);
  const role = opts.role || (review ? "reviewer" : "builder");
  const def = core.toolDefault(core.readConfig(), "gpt", role);
  const model = opts.model || def.model || "";
  const effort = opts.effort || def.effort || "";
  const timeoutMin = Number(opts["timeout-min"]) > 0 ? Number(opts["timeout-min"]) : 30;

  const codex = core.findCodex();
  if (!codex) return say("ERROR: Codex CLI is not installed. Run: npm install -g @openai/codex", 2);
  if (dt.missingDir || !fs.existsSync(dt.dir) || !fs.statSync(dt.dir).isDirectory()) return say("ERROR: folder not found: " + dt.dir, 4);
  const st = await core.run({ cmd: codex.cmd, args: [...codex.pre, "login", "status"], timeoutMs: 60000 });
  const stText = st.out + "\n" + st.err;
  if (/not logged in|logged out/i.test(stText) || !/logged in/i.test(stText)) return say("ERROR: Codex is not signed in. Run 'codex' in a terminal and choose 'Sign in with ChatGPT'.", 3);

  const dir = fs.realpathSync(dt.dir);
  const last = path.join(os.tmpdir(), "ai-team-gpt-" + crypto.randomBytes(8).toString("hex") + ".txt");
  const args = ["exec", "--sandbox", review ? "read-only" : "workspace-write", "-C", dir, "--skip-git-repo-check", "--ephemeral", "--color", "never", "--output-last-message", last];
  if (model) args.push("-m", model);
  if (effort) args.push("-c", `model_reasoning_effort="${effort}"`);
  args.push("-");
  const prefix = review
    ? "You are a strict code reviewer. Do not modify any files. Report only real problems with file and line, then a final line PASS or FAIL. "
    : "When done, reply in at most 5 lines: what you changed and how you checked it. ";
  const input = prefix + task;

  const start = Date.now();
  let status = "failed", code = 1, out = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { fs.unlinkSync(last); } catch {}
    const r = await core.run({ cmd: codex.cmd, args: [...codex.pre, ...args], input, cwd: dir, timeoutMs: timeoutMin * 60 * 1000 });
    code = r.code;
    let answer = "";
    try { answer = fs.readFileSync(last, "utf8").replace(/^﻿/, "").trim(); } catch {}
    const all = r.out + "\n" + r.err;
    if (r.timedOut) { out = `ERROR: GPT (${model || "default"}) gave no answer in ${timeoutMin} min (tried ${attempt} times). Do the work yourself and tell the user.`; status = "timeout"; code = 124; continue; }
    if (core.isLimit(all) && !answer) {
      if (attempt < 2) { await core.sleep(20000); continue; }
      status = "limit"; code = 6;
      const line = all.split(/\r?\n/).find((l) => /limit|quota|try again/i.test(l)) || "";
      out = `LIMIT: GPT plan limit reached (${model || "default"}). Give this role to another model with /team and tell the user. ` + line.trim();
      break;
    }
    if (code === 0 && answer) { status = "done"; out = answer; break; }
    out = `ERROR: GPT failed (exit ${code}, try ${attempt} of 2). Last lines: ` + core.lastLines(all, 4);
    if (attempt < 2) await core.sleep(5000);
  }
  try { fs.unlinkSync(last); } catch {}
  core.log({ tool: "gpt", role, model, effort, seconds: (Date.now() - start) / 1000, status, task });
  say(out, status === "done" ? 0 : code);
}

main().catch((e) => say("ERROR: " + (e && e.message || e), 1));
