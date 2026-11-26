---
name: ai-team-council
description: AI team: all three models (Claude, GPT, Gemini) answer separately, then compare and merge. Use for /ai-team-council or @all.
---

# AI team: council

1. Send the same question to all three at once with the helpers in {{TEAM}}/bin: `ask-claude{{EXT}}`, `ask-gpt{{EXT}} -Review`, `ask-gemini{{EXT}}` (each takes <folder> "task"). Use long timeouts.
2. If one of the three is you, answer it yourself, separately, before reading the others.
3. Compare the answers: where they agree, where they differ, which claims you verified.
4. Merge into one recommendation. If a helper prints ERROR, say so and continue with the rest.
5. Reply in the user's language, short: the merged answer, then one line per model on what you took from it.
