---
id: DEC-0006
kind: decision
title: One-line, Cypher-like path patterns (SDPQ)
status: accepted
category: architecture
date: 2026-11-10
deciders: [architecture]
iteration: I1
---

# One-line, Cypher-like path patterns (SDPQ)

## Context

People, agents, milestone gates and decision guards all ask the graph multi-hop questions:
"ready requirements whose elements have no decision", "everything that points at this
decision". The question has to fit a shell argument and a single Gherkin step.

## Options

1. **jq over the exported JSON.** Agents already know jq, but multi-hop questions become long,
   error-prone programs, and they cannot be embedded in a scenario step.
2. **Full Cypher or SPARQL.** Expressive and familiar, but a heavy engine and multi-line queries
   that fit neither a shell argument nor a step.
3. **A small path-pattern language** borrowing Cypher's ASCII-art edges.

## Decision

Option 3: `requirement[maturity<ready] -realized-by-> element !-decided-by-> decision`. An edge prefixed
with `!` or `?` keeps the nodes without or with such a neighbour; a trailing `+` follows a
relation transitively. A query returns nodes or paths, nothing more. The language is specified in
[[REQ-graph-query]].

SDPQ is a convenience, never the only door. `sdp graph` hands the same graph over as plain data,
one record per line ([[REQ-graph-export]]), and whatever a query answers, jq over those records
answers too — counting and grouping included, which SDPQ leaves to them. The [[README]] runs one
question all three ways.

## Consequences

- Milestone gates, architecture rules and decision guards are one-liners in scenarios.
- The syntax is a public contract; changing it breaks specs in every workspace.
