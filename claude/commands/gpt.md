---
description: Give a task to GPT (Codex, ChatGPT subscription). Start with "review" for a read-only review.
argument-hint: "[review] <task>"
---
Send this to GPT through the AI team helper: $ARGUMENTS

- If the text starts with "review", run `{{BIN}}/ask-gpt{{EXT}} -Review <current project folder> "<task, with the files or diff to review>"`.
- Otherwise run `{{BIN}}/ask-gpt{{EXT}} <current project folder> "<task>"`. Write the task so GPT can do it alone: goal, files it owns, what not to touch, how to prove it works.
- Run it in the background if it may take long. When it returns: read the diff yourself, run the tests yourself, then tell the user in their language in 3 lines what GPT did and whether it passed.
- If the helper prints a line starting with ERROR, show that line and the fix it names, and stop. If it starts with LIMIT, give the role to another model (`set-team{{EXT}} <role> <model>`), tell the user in one line, and continue.
- Start your reply with one line: "Handed to GPT-<model>: <why>".
