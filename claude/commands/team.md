---
description: Pick who plays each AI team role (arrow-key menu), or set one by text, e.g. /team builder gpt-6.2-astra
argument-hint: "[builder|reviewer|advisor|designer <model> [effort]] | reset"
---
AI team settings: `{{TEAM}}/config.json`. Roles: builder (writes big backend code), reviewer (reviews diffs), advisor (second plan, ideas, UI copy), designer (Claude, used only when Codex or Antigravity leads). The lead is this chat's model (change it with /model).

Arguments: $ARGUMENTS

## No arguments: arrow-key menu
1. Run `{{BIN}}/list-models{{EXT}}` and read the JSON: gpt (Codex models + efforts), gemini (models on the user's Google plan now), gemini_locked (need a paid plan), claude, config (current roles and mode).
2. Ask with AskUserQuestion, in the user's language, one question per call:
   - Q1 "Which role to change?": options "Builder (writes code)", "Reviewer (checks)", "Advisor (second plan, copy)", "Designer (Claude, when another model leads)". Put each role's current model in its description.
   - Q2 "Which model?": 4 options from the live lists that fit the role. Builder/reviewer: GPT-6.2 Astra, GPT-6.2 Sol, Claude Opus, one more. Advisor: Gemini 4 Hydrogen (High), Gemini 4 Hydrogen (XHigh), Gemini 3.8 Flash (High), and if gemini_locked is not empty "Gemini 4 Neon 🔒" with description "needs Google AI Pro or Ultra". Designer: opus, sonnet, haiku. Mark the current one "(current)". In the question text list the other live models in one line so the user can type any of them in "Other".
   - Q3 only if the model is GPT, "Thinking depth?": "medium (faster, saves quota)", "high (recommended)", "xhigh (hard tasks only)".
3. Locked model picked: don't save; say in one line it needs Google AI Pro and offer the best available one.
4. Save: `{{BIN}}/set-team{{EXT}} <role> "<model id or exact Gemini name>" [-Effort <level>]`. It makes one test call first and refuses to save a model that doesn't answer.
5. Reply in one line in the user's language: what changed (the status line at the bottom shows it).

## Text form
- `/team builder gpt-6.2-astra high` → `set-team{{EXT}} builder gpt-6.2-astra -Effort high`
- `/team reviewer opus` → `set-team{{EXT}} reviewer opus` (any role can go to any model: GPT ids, exact Gemini names, opus/sonnet/haiku)
- `/team advisor "Gemini 4 Hydrogen (XHigh)"`
- `/team reset` → `set-mode{{EXT}} pro`
If set-team prints "NOT SAVED", show its lines as one plain line and stop.
