# claude-gemini-gpt-together

Claude, GPT and Gemini working as one team, on the subscriptions you already pay for
(Claude Pro/Max, ChatGPT Plus/Pro, a Google account). No API keys.

Each model runs only inside its own official CLI:

| Model  | CLI                  | Headless call |
|--------|----------------------|---------------|
| Claude | Claude Code          | `claude -p`   |
| GPT    | OpenAI Codex CLI     | `codex exec`  |
| Gemini | Google Antigravity CLI | `agy -p`    |

You sign into each CLI once. The CLI uses your subscription and its plan limits.

## How it works

```
You  ->  lead app (Claude Code, Codex or Antigravity)
         lead  ->  helper scripts (ask-gpt, ask-gemini, ask-claude, ask-team)
                   helpers  ->  the other two CLIs, on your subscriptions
```

The app you talk to is the lead. It does small things itself and calls the other
two through small helper scripts. A lead never calls itself.

## Roles

| Role     | What it does                                   | Default |
|----------|------------------------------------------------|---------|
| builder  | Big backend work, algorithms                   | GPT |
| reviewer | Reviews diffs; a model that did not write them | another model |
| advisor  | Independent second plan, ideas, UI copy (read-only) | Gemini |
| designer | Design and frontend, when Codex or Antigravity leads | Claude |

Strengths: Claude has the best taste, does design and frontend, and has the final
say. GPT is the most rigorous. Gemini is fast with ideas and words.
Any role can be given to any model.

## Install

Windows, macOS and Linux. Needs Node.js 18+ (no npm packages) and at least one of the three CLIs.

```
git clone https://github.com/51bodila/claude-gemini-gpt-together
cd claude-gemini-gpt-together
node install.js
```

The installer backs up every file it changes to `~/.ai-team/backup/<timestamp>`,
never overwrites your own rules (it appends between markers), and installs into
each app that is present. Helpers go to `~/.ai-team/bin`, which is added to PATH.

Options:

| Flag | What it does |
|---|---|
| `--mode eco\|pro\|max\|solo` | Starting mode (default `pro`). |
| `--accept-agy-risk` | Turns the Gemini helper on (see Known limits: Terms risk). |
| `--agy-auto-allow-helpers` | Lets Antigravity run only the `ask-*` / `set-*` helpers without asking. Any other command, or a helper call chained with `&`, `;`, `\|`, `$(...)`, still asks you. Needed only for headless `agy -p`. |

For Codex, the installer adds `~/.ai-team` (and nothing else) to the sandbox's `writable_roots`, so helpers can write their log. No network or full access.

Uninstall: `node uninstall.js` (removes only what the installer added; keeps your config, log and backups).
Tests: `node --test tests/` (no model calls). Live check: `node tests/smoke.js` asks each installed model "Reply with exactly: OK".

Tasks with code, quotes or several lines: pass them with `--task-file <file>` (or `-` to read stdin). Helpers spawn the CLIs without a shell, so the text arrives byte-exact; only your own shell can mangle quotes on the command line.

## Sign in

One line per tool, in your own terminal. Never paste keys anywhere.

| Tool   | Command | Choice |
|--------|---------|--------|
| Claude | `claude` | Log in with your Claude account |
| GPT    | `codex`  | Choose "Sign in with ChatGPT" |
| Gemini | `agy`    | Sign in with Google |

## Helper commands

| Command | What it does |
|---------|--------------|
| `ask-gpt [-Review] [-Model] [-Effort] <folder> "task"` | Codex call. Workspace-write sandbox; read-only with `-Review`; never full access |
| `ask-gemini [-Model "Gemini 4 Hydrogen (High)"] [folder] "task"` | Antigravity call, read-only, plan mode |
| `ask-claude [-Build] [-Model] [folder] "task"` | Claude call. Read-only unless `-Build`, which can edit files but not run shell |
| `ask-team <role> [folder] "task"` | Sends the task to whoever plays that role |
| `set-team <role> <model> [-Effort]` | Assigns a role. Makes one test call first and refuses a model that does not answer |
| `set-mode eco\|pro\|max\|solo` | Switches a preset (below) |
| `list-models` | Live list from each CLI, locked models marked |

## Modes

| Mode | GPT | Gemini | Claude |
|------|-----|--------|--------|
| eco  | gpt-6-luna, medium | Gemini 3.8 Flash Low | haiku |
| pro  | gpt-6.2-astra, high (reviewer: astra medium) | Gemini 4 Hydrogen High | opus |
| max  | astra, xhigh | Hydrogen XHigh | opus |
| solo | lead works alone | | |

Available models depend on your plan. Gemini 4 Neon and Carbon need Google AI
Pro or Ultra.

## Reliability

- Hard timeouts: GPT 30 min, Gemini 15 min, Claude 30 min. One retry.
- Limit detection: a `LIMIT` line means you can give that role to another model.
- `agy` JSON errors are shown as one line, with the models available on your plan.
- Every call is logged to `~/.ai-team/log.csv`: time, tool, role, model, effort,
  seconds, status.
- Works when called from scripts (stdin closed, no TTY).

## Extras per lead app

**Claude Code**
- Slash commands: `/team` (arrow-key menu: role, model, thinking depth), `/mode`,
  `/gpt`, `/gemini`, `/claude`, `/council` (all three answer separately; the lead
  compares and merges).
- @mentions in any message via a UserPromptSubmit hook: `@gpt @astra @sol @gemini
  @hydrogen @flash @claude @opus @all`.
- Status line, for example `pro · Astra high · Hydrogen High · 12 calls`.
- Rules are appended to `~/.claude/CLAUDE.md` between markers.

**Codex as lead**: rules in `~/.codex/AGENTS.md`, skills in
`~/.agents/skills/ai-team-*` (invoke with `$ai-team-team` and so on).

**Antigravity as lead**: a global plugin at `~/.gemini/config/plugins/ai-team`
(rules) and skills in `~/.gemini/config/skills/ai-team-*`.

## Rules the lead follows

- Name a model and it uses that model.
- Small edits: the lead does them itself.
- Big plans: the lead's plan plus an independent plan from another model, given
  your original words, then merged.
- Big backend: goes to GPT with an interface and acceptance tests. The lead reads
  the diff and runs the tests.
- Every merge is reviewed by a model that did not write it. Only money, data loss,
  permissions, messages to people and broken releases block. Two rounds max.
- Every fixed bug becomes a test.
- Hand-off line at the top of the reply, for example "Handed to GPT-6.2 Astra: backend".

## Check that it is really GPT or Gemini answering

- Look at the rows in `~/.ai-team/log.csv`.
- In `codex`, run `/status`: plan usage goes up after calls.
- Run `codex exec --skip-git-repo-check "Which model are you?"`.
- Watch `codex.exe` or `agy.exe` in Task Manager during a call.

## Known limits

- Tested live on Windows 11. macOS and Linux use the same code and paths from the CLIs' docs; please open an issue if a CLI is not found (override with env `AI_TEAM_CODEX`, `AI_TEAM_CLAUDE`, `AI_TEAM_AGY`).
- `agy -p` takes the prompt only as an argument, not from stdin.
- `agy` in headless print mode cannot run commands (no one to approve). Interactive
  Antigravity asks you once per command; for headless use install with `-AgyAutoAllowHelpers`.
- Codex's sandbox cannot see agy's Google sign-in. The rules tell Codex to re-run
  that one helper outside the sandbox, which you approve in Codex.
- Claude's claude.ai sign-in for scripts expires. Re-run `claude auth login`.
- Google staff have said that wrapping `agy -p` inside other agents on consumer
  plans may break Antigravity's Terms. The Gemini helper is therefore OFF until you
  create the file `~/.ai-team/allow-agy` yourself. Your choice, your account.
- Codex on ChatGPT Plus has small limits. Prefer eco or pro.

## License

MIT. See [LICENSE](LICENSE).
