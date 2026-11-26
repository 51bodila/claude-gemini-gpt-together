#!/usr/bin/env node
// list-models: JSON with the models each CLI really offers on the user's plans now, locked ones, and the current team.
"use strict";
const core = require("./core");

async function listModels() {
  const out = { gpt: [], gemini: [], gemini_locked: [], claude: [], config: core.readConfig() };
  const codex = core.findCodex();
  if (codex) {
    const r = await core.run({ cmd: codex.cmd, args: [...codex.pre, "debug", "models"], timeoutMs: 60000 });
    try {
      const j = JSON.parse(r.out);
      out.gpt = (j.models || []).filter((m) => m.visibility === "list").map((m) => ({
        id: m.slug, name: m.display_name, about: m.description,
        efforts: (m.supported_reasoning_levels || []).map((x) => x.effort),
      }));
    } catch {}
  }
  const agy = core.findAgy();
  if (agy) {
    const r = await core.run({ cmd: agy.cmd, args: [...agy.pre, "models"], timeoutMs: 60000 });
    out.gemini = r.out.split(/\r?\n/).filter((l) => l.includes("\t")).map((l) => { const [id, name] = l.split("\t"); return { id: id.trim(), name: (name || "").trim() }; });
    const names = out.gemini.map((g) => g.name);
    for (const m of ["Gemini 4 Neon", "Gemini 4 Carbon"]) if (!names.some((n) => n.startsWith(m))) out.gemini_locked.push({ name: m, why: "needs Google AI Pro or Ultra" });
  }
  if (core.findClaude()) {
    out.claude = [
      { id: "opus", name: "Claude Opus (newest)", about: "strongest: design, frontend, final say" },
      { id: "sonnet", name: "Claude Sonnet (newest)", about: "everyday" },
      { id: "haiku", name: "Claude Haiku (newest)", about: "cheapest" },
    ];
  }
  return out;
}
if (require.main === module) listModels().then((o) => core.finish(JSON.stringify(o, null, 2), 0));
module.exports = { listModels };
