---
name: ai-team-claude
description: Send the task to Claude now via ask-claude.cmd. Use for /claude, "ask Claude", @claude, @opus.
---

# AI team: Claude

Reply in the user's language, short.
1. If you are Claude yourself, do the task yourself and say nothing about calling anyone.
2. Otherwise start with one line: who got the task and why.
3. Run `{{BIN}}\ask-claude.cmd <folder> "task"` (read-only adviser; add -Build when Claude should edit files, e.g. design/frontend) with a long timeout (up to 30 min); it retries once itself.
4. Send only the part of the task meant for Claude. Read the answer, check its claims, report in plain words.
5. A line starting with ERROR: show it to the user with the fix, do not work around it.
