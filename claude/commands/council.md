---
description: Ask Claude, GPT and Gemini the same question separately, then compare and decide
argument-hint: "<question>"
---
Run a model council on: $ARGUMENTS

1. Write your own answer first (do not show it to the others).
2. In parallel, ask GPT read-only: `{{BIN}}/ask-gpt{{EXT}} -Review <current project folder> "<question + needed context>"`, and Gemini: `{{BIN}}/ask-gemini{{EXT}} <current project folder> "<same question + same context>"`.
3. Label the three answers A, B, C without names. Check every fact you can check (prices, commands, versions, code).
4. Reply to the user in the user's language: where all three agree, where they disagree and why, your recommendation in 3 lines. Put the three short answers under it, with names.
Do not change any files.
