---
id: DEC-0007
kind: decision
title: One-line, Cypher-like path patterns (SDPQ)
status: accepted
category: architecture
date: 2026-10-14
deciders: [architecture]
iteration: C1
links:
  supersedes: DEC-0006
  affects: [REQ-graph-query, ARCH-query-engine]
---

# One-line, Cypher-like path patterns (SDPQ)

## Context

See [[DEC-0006]]: jq made multi-hop questions hard to write and impossible to embed in scenarios.
Full Cypher or SPARQL would mean a heavy engine and multi-line queries that do not fit a shell
argument or a Gherkin step.

## Decision

A small path-pattern language whose syntax borrows Cypher's ASCII-art edges, so agents can guess
it: `requirement[maturity<ready] -realized-by-> element[significant]`. Filters with `!`/`?`
express absence and presence; `+` gives transitive closure. It returns nodes or paths, nothing more
— aggregation stays with `jq`/`awk` over `--json` output.

## Consequences

- Milestone gates, architecture rules and decision guards are one-liners in scenarios.
- The syntax is a public contract; changing it breaks specs in every workspace.
