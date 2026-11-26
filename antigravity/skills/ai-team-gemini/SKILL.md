---
name: ai-team-gemini
description: AI team: send the task to gemini right now. Use for /ai-team-gemini or when the user says to give it to gemini.
---

# AI team: gemini

1. If you are gemini yourself, do the task yourself and skip the helper.
2. Otherwise run `{{BIN}}\ask-gemini.cmd <project folder> "<task>"` with a long timeout (up to 30 min). Put the user's words and the needed context in the task.
3. Read the answer, check its claims against the code or facts, and run tests yourself if files changed.
4. If it prints ERROR or LIMIT, tell the user the one-line reason in the user's language and do not work around it.
5. Reply in the user's language, short, starting with: who got the task and why.
