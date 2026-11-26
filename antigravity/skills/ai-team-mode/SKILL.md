---
name: ai-team-mode
description: AI team: set the working mode eco, pro, max or solo. Use for /ai-team-mode or when the user names a mode.
---

# AI team: mode

1. Take the mode from the user's text: eco, pro, max or solo. If missing, ask in the user's language which one.
2. Run `{{BIN}}\set-mode.cmd <mode>`.
3. Show its output. If it prints ERROR, tell the user the one-line reason and do not work around it.
4. Reply in the user's language, short: the mode now and what it means (solo = no teammates, you do everything).
