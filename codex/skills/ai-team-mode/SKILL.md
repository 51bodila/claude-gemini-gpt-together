---
name: ai-team-mode
description: Switch the whole AI team to a preset mode: eco, pro, max or solo. Use for "mode pro", "mode solo", "switch the team to eco".
---

# AI team: mode

Reply in the user's language, short.
1. Take the mode from the user's words: eco (cheap), pro (default), max (strongest), solo (lead works alone, teammates only when the user names one). If missing, ask.
2. Run `{{BIN}}/set-mode{{EXT}} <eco|pro|max|solo>`.
3. Show the SAVED line as one plain sentence: who plays which role now. If it starts with ERROR, show it with the fix.
