---
name: ai-team-council
description: Ask all three models (Claude, GPT, Gemini) separately, then compare and merge. Use for /council, "ask everyone", @all.
---

# AI team: council

Reply in the user's language, short.
1. Send the user's original words (not your draft) to the two models that are not you, in parallel when you can:
   `{{BIN}}/ask-claude{{EXT}} <folder> "task"`, `{{BIN}}/ask-gpt{{EXT}} -Review <folder> "task"`, `{{BIN}}/ask-gemini{{EXT}} <folder> "task"`.
2. Write your own answer too. If you are one of the three, skip your own helper.
3. Use long timeouts (GPT up to 30 min, Gemini 15). A model with no answer after its retry: say so and go on.
4. Compare: where they agree, where they differ, which claims you checked. Merge into one answer and say what you took from each.
5. A line starting with ERROR: show it to the user with the fix.
