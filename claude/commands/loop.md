---
description: Build, test, review, fix until every test passes (max 3 rounds), with the builder (e.g. Gemini 4 Neon) and the lead as reviewer.
argument-hint: "<goal>"
---
Goal: $ARGUMENTS

1. You (the lead/brain) write the spec, the interface and the acceptance tests first. "Done" = every test passes.
2. Round N (max 3): send the spec plus, from round 2, the exact failing test output and the fix you want: `{{BIN}}/ask-team{{EXT}} builder <project folder> --task-file <spec>` (if YOU are the builder model, do it yourself).
3. Run the tests yourself. Read the diff. All pass and the diff is sane: stop. Otherwise write the exact failures + fixes and go to the next round.
4. After round 3 with tests still failing: stop and show the user what still fails and your best guess why.
5. Every bug fixed in the loop becomes a test.
6. Report in the user's language: rounds, tests passed, who built (model + seconds from {{TEAM}}/log.csv).
