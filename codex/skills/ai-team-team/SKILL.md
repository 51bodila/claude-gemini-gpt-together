---
name: ai-team-team
description: Choose which model plays a role (builder, reviewer, advisor, designer) in the user's AI team and at what effort. Use for "team", "who is the builder", "team builder gpt-6.2-astra high".
---

# AI team: pick a model for a role

Reply in the user's language, short.
1. Text form "team <role> <model> [effort]": skip to step 4.
2. Otherwise ask which role (builder, reviewer, advisor, designer).
3. Run `{{BIN}}\list-models.cmd` for the live list of models on the user's plans (locked ones are marked); offer only those, then ask the effort (low, medium, high, xhigh; Gemini has it in the name).
4. Save: `{{BIN}}\set-team.cmd <role> <model> -Effort <effort>`. It makes a test call and refuses a model that does not answer.
5. If the output starts with ERROR, show that line to the user with the fix; do not work around it. Otherwise confirm the new role map in one line.
