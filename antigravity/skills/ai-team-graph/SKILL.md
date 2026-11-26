---
name: ai-team-graph
description: AI team graph: Draw the team plan for a goal as a Mermaid graph (agents, handoffs, parallel branches, loop), wait for a yes, then run it with swarm + loop. Use for /graph or when the user asks to graph a goal.
---

# AI team: graph

Goal: the user's request.

1. You (the lead/brain) plan the work as a graph:
   - nodes: Lead (brain), Builder (model from {{TEAM}}/config.json), each part, Tests, Reviewer, User approval
   - edges labeled with what they carry (spec, code, test results, fixes)
   - independent parts as parallel branches that join; the fix loop as an edge back from Tests to Builder (max 3)
2. Show it as a Mermaid flowchart (short node names, no quotes or brackets inside labels), then the line "Paste this at mermaid.live to see the picture", then a plain arrow version.
3. Wait for the user's yes. Do not build before it.
4. On yes: run the parallel parts like /swarm and each failing part like /loop. Report with the same table.
