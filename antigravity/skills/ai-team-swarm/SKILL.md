---
name: ai-team-swarm
description: AI team swarm: Split a goal into 2-5 independent parts; the builder (e.g. Gemini 4 Neon) builds them in parallel; the lead joins, tests and reviews. Use for /swarm or when the user asks to swarm a goal.
---

# AI team: swarm

Goal: the user's request.

1. Plan (you, the lead/brain): split the goal into 2-5 parts that do NOT depend on each other. For each part write: the files it owns (no overlaps), the interface, and acceptance tests. Write each part spec to its own temp file.
2. Build in parallel: start one builder call per part at the same time (background jobs), each with its spec: `{{BIN}}/ask-team{{EXT}} builder <project folder> --task-file <part spec>`. If YOU are the builder model, build those parts yourself.
3. Join: wait for all, read every diff, fix overlaps.
4. Test: run all tests yourself. A failing part goes back to its builder once with the exact failure (like /loop, max 2 rounds).
5. Review: a model that did not write the code reviews the diff (`{{BIN}}/ask-team{{EXT}} reviewer <folder> --task-file <file>`).
6. Report in the user's language: a table part | who built it | model | seconds | tests, from {{TEAM}}/log.csv. First line: who got what.
