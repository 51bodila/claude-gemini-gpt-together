---
name: ai-team-gemini
description: Send the task to Gemini now via ask-gemini{{EXT}}. Use for /gemini, "ask Gemini", @gemini, @hydrogen, @flash.
---

# AI team: Gemini

Reply in the user's language, short.
1. If you are Gemini yourself, do the task yourself and say nothing about calling anyone.
2. Otherwise start with one line: who got the task and why.
3. Run `{{BIN}}/ask-gemini{{EXT}} <folder> "task"` (read-only adviser) with a long timeout (up to 30 min); it retries once itself.
4. Send only the part of the task meant for Gemini. Read the answer, check its claims, report in plain words.
5. A line starting with ERROR: show it to the user with the fix, do not work around it.
