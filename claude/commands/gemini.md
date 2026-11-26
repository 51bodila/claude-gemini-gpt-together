---
description: Ask Gemini (Antigravity CLI, Google subscription) for ideas, a second plan or copy edits. Read-only.
argument-hint: "<question or task>"
---
Ask Gemini through the AI team helper: $ARGUMENTS

- Run `{{BIN}}/ask-gemini{{EXT}} <current project folder> "<question>"`. For a second plan, pass the user's own words and the needed background, not your draft.
- Check Gemini's claims against the code and facts before using them; anything it marks "guess" must be verified.
- Report to the user in the user's language: Gemini's answer in short, what you agree with, what you checked and found wrong.
- If the helper prints a line starting with ERROR, show that line and the fix it names, and stop. If it starts with LIMIT, give the role to another model (`set-team{{EXT}} advisor <model>`), tell the user in one line, and continue.
- Start your reply with one line: "Asked Gemini <model>: <why>".
