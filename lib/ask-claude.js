#!/usr/bin/env node
// ask-claude: ask Claude through Claude Code CLI (claude -p), on the Claude subscription (no API key).
// Read-only by default. -Build lets it edit files inside the folder (no shell commands).
// Usage: ask-claude [-Build] [-Model m] [-Role r] [-TimeoutMin n] [--task-file f] [<folder>] "task"
"use strict";
const fs = require("fs");
const path = require("path");
const core = require("./core");

async function main() {
  const { flags, opts, rest } = core.parseArgs(process.argv.slice(2), {
    flags: ["build", "image"],
    options: ["model", "role", "timeout-min", "task-file", "effort"],
  });
  if (process.env.CLAUDECODE === "1" && !process.env.AI_TEAM_ALLOW_SELF)
    return core.finish("ERROR: you are Claude (the lead). A lead never calls itself: do this part yourself.", 7);

  if (flags.image) return core.finish("ERROR: Claude can't generate raster images. Use ask-gpt -Image or ask-gemini -Image; Claude can draw SVG itself.", 4);
  const role = opts.role || "designer";
  const timeoutMin = parseInt(opts["timeout-min"], 10) || 30;
  const dt = core.dirTask(rest, opts);
  if (dt.missingDir) return core.finish(`ERROR: folder not found: ${dt.dir}`, 4);
  const task = dt.task;
  if (!task) return core.finish('ERROR: no task. Usage: ask-claude [folder] "task"', 4);
  const cfg = core.readConfig();
  const model = opts.model || core.toolDefault(cfg, "claude", role).model || "";

  const claude = core.findClaude();
  if (!claude) return core.finish("ERROR: Claude Code CLI is not installed. Install it from https://claude.ai/install (Windows: irm https://claude.ai/install.ps1 | iex; macOS/Linux: curl -fsSL https://claude.ai/install.sh | bash)", 2);
  if (!fs.existsSync(dt.dir)) return core.finish(`ERROR: folder not found: ${dt.dir}`, 4);
  const dir = path.resolve(dt.dir);

  const args = ["-p", "--output-format", "json", "--no-session-persistence"];
  if (model) args.push("--model", model);
  let prefix;
  if (flags.build) {
    args.push("--permission-mode", "acceptEdits", "--allowedTools", "Read,Grep,Glob,Edit,Write", "--disallowedTools", "Bash,WebFetch,WebSearch");
    prefix = "When done, reply in at most 5 lines: what you changed and how you checked it. ";
  } else {
    args.push("--allowedTools", "Read,Grep,Glob", "--disallowedTools", "Edit,Write,NotebookEdit,Bash,WebFetch,WebSearch");
    prefix = "You are a read-only adviser. Do not change any files. Mark anything you are not sure about as 'guess'. ";
  }
  // Prompt goes FIRST as an argument (claude 2.1.x hangs when the prompt is piped on stdin; --allowedTools is variadic and would eat a trailing prompt).
  const prompt = prefix + task;
  args.unshift(prompt); args.unshift(...claude.pre);

  const start = Date.now();
  let status = "failed", code = 1, out = "";
  const drop = ["CLAUDECODE", "CLAUDE_CODE_*", "ANTHROPIC_BASE_URL", "CLAUDE_AGENT_SDK_*", "CLAUDE_PID"];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await core.run({ cmd: claude.cmd, args, input: "", cwd: dir, timeoutMs: timeoutMin * 60 * 1000, dropEnv: drop });
    code = r.code;
    if (r.timedOut) { status = "timeout"; out = `ERROR: Claude (${model || "default"}) gave no answer in ${timeoutMin} min (tried ${attempt} times). Do the work yourself and tell the user.`; continue; }
    const jsonLine = r.out.split(/\r?\n/).filter((l) => l.trimStart().startsWith('{"')).pop();
    let j = null; try { j = JSON.parse(jsonLine); } catch {}
    if (/not logged in|please run \/login|invalid api key/i.test(r.out + " " + r.err)) { status = "failed"; code = 3; out = "ERROR: Claude Code is not signed in. Run 'claude' in a terminal and log in with your Claude account."; break; }
    if (j && !j.is_error && j.result) { status = "done"; code = 0; out = String(j.result).trim(); break; }
    const msg = j ? String(j.result || "") : core.lastLines(r.out || r.err, 2);
    if (core.isLimit(msg)) {
      if (attempt < 2) { await core.sleep(20000); continue; }
      status = "limit"; code = 6; out = `LIMIT: Claude plan limit reached (${model || "default"}). Give this role to another model with /team and tell the user. ${msg}`; break;
    }
    status = "failed";
    out = `ERROR: Claude failed (exit ${code}): ${msg}`;
    if (/model.*(not found|invalid|not available)/i.test(msg)) break;
    await core.sleep(5000);
  }
  core.log({ tool: "claude", role, model, effort: "", seconds: (Date.now() - start) / 1000, status, task });
  if (status === "done") return core.finish(out, 0);
  return core.finish(out, code === 0 ? 1 : code);
}
main();
