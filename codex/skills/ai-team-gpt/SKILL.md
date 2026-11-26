---
name: ai-team-gpt
description: Send the task to GPT now via ask-gpt{{EXT}}. Use for /gpt, "give this to GPT", @gpt, @astra, @sol.
---

# AI team: GPT

Reply in the user's language, short.
1. If you are GPT yourself, do the task yourself and say nothing about calling anyone.
2. Otherwise start with one line: who got the task and why.
3. Run `{{BIN}}/ask-gpt{{EXT}} <folder> "task"` (builds in that folder only; add -Review for read-only) with a long timeout (up to 30 min); it retries once itself.
4. Send only the part of the task meant for GPT. Read the answer, check its claims, report in plain words.
5. A line starting with ERROR: show it to the user with the fix, do not work around it.

- Picture/photo/image request: run `{{BIN}}/ask-gpt{{EXT}} -Image [--out name.png] <folder> "<picture description>"`, then send the file path it prints to the user.
