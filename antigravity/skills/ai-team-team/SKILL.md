---
name: ai-team-team
description: AI team: choose which model plays a role (builder, reviewer, advisor, designer) and its effort. Use for /ai-team-team or text like 'team builder gpt-6.2-astra high'.
---

# AI team: team

1. If the user gave text like `team builder gpt-6.2-astra high`, run it directly (step 3). Otherwise ask in the user's language: which role, which model, which effort.
2. Run `{{BIN}}\list-models.cmd` for the live model list and offer only models from it.
3. Run `{{BIN}}\set-team.cmd <role> <model> -Effort <effort>` (roles: builder, reviewer, advisor, designer). It makes a test call first and refuses models that do not answer.
4. Show its output. If it prints ERROR, tell the user the one-line reason and do not work around it.
5. Reply in the user's language, short: who plays which role now.
