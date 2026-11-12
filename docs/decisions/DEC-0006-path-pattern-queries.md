---
id: DEC-0006
kind: decision
title: One-line, Cypher-like path patterns (SDPQ)
status: accepted
category: architecture
date: 2026-11-10
deciders: [architecture]
iteration: C1
links:
  affects: [REQ-graph-query, ARCH-query-engine]
---

# One-line, Cypher-like path patterns (SDPQ)

## Context

People, agents, milestone gates and decision guards all ask the graph multi-hop questions:
"ready requirements whose significant elements have no decision", "everything that points at this
decision". The question has to fit a shell argument and a single Gherkin step.

## Options

1. **jq over the exported JSON.** Agents already know jq, but multi-hop questions become long,
   error-prone programs, and they cannot be embedded in a scenario step.
2. **Full Cypher or SPARQL.** Expressive and familiar, but a heavy engine and multi-line queries
   that fit neither a shell argument nor a step.
3. **A small path-pattern language** borrowing Cypher's ASCII-art edges.

## Decision

Option 3: `requirement[maturity<ready] -realized-by-> element[significant]`. Filters with `!`/`?`
express absence and presence; `+` gives transitive closure. A query returns nodes or paths, nothing
more — aggregation stays with `jq`/`awk` over `--json` output, and the JSON/JSONL exports remain
for jq users.

## Consequences

- Milestone gates, architecture rules and decision guards are one-liners in scenarios.
- The syntax is a public contract; changing it breaks specs in every workspace.
