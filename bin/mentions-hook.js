// Claude Code UserPromptSubmit hook: turns @gpt / @gemini / @claude / @all (and model names) into a routing note.
// Prints nothing when the message has no mention, so normal messages cost nothing.
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let prompt = "";
  try { prompt = JSON.parse(raw).prompt || ""; } catch { return; }
  const has = (re) => re.test(prompt);
  const hits = [];
  if (has(/(^|\s)@all\b/i)) hits.push("@all: ask GPT (ask-gpt -Review) and Gemini (ask-gemini) the same question in parallel, answer yourself too, then compare and merge like /council.");
  if (has(/(^|\s)@(gpt|astra|sol|luna|codex)\b/i)) {
    const m = prompt.match(/(^|\s)@(astra|sol|luna)\b/i);
    const model = m ? ` -Model gpt-6.2-${m[2].toLowerCase()}`.replace("gpt-6.2-luna", "gpt-6-luna") : "";
    hits.push(`@gpt: send the part of the message addressed to GPT with ask-gpt${model} (add -Review if it only needs reading).`);
  }
  if (has(/(^|\s)@(gemini|hydrogen|flash)\b/i)) {
    const m = prompt.match(/(^|\s)@(hydrogen|flash)\b/i);
    const model = m ? (m[2].toLowerCase() === "flash" ? ' -Model "Gemini 3.8 Flash (High)"' : ' -Model "Gemini 4 Hydrogen (High)"') : "";
    hits.push(`@gemini: send the part of the message addressed to Gemini with ask-gemini${model}.`);
  }
  if (has(/(^|\s)@(claude|opus|sonnet|haiku)\b/i)) hits.push("@claude: that part is for you (Claude); do it yourself.");
  if (!hits.length) return;
  process.stdout.write("AI team mentions in the user's message (helpers in " + require("path").join(require("os").homedir(), ".ai-team", "bin") + "): " + hits.join(" ") + " Start your reply with one line saying who got what.");
});
