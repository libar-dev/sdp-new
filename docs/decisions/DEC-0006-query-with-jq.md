---
id: DEC-0006
kind: decision
title: Query the graph with jq over exported JSON
status: superseded
category: architecture
date: 2026-10-01
deciders: [architecture]
iteration: E2
links:
  affects: [REQ-graph-query]
---

# Query the graph with jq over exported JSON

## Context

Agents already know `jq`; inventing a query language is a cost.

## Decision

Export the graph as JSON and let agents use `jq`.

## Consequences

Multi-hop questions ("ready requirements whose significant elements lack a decision") turned out
to be long, error-prone jq programs, and milestone gates could not express them in a scenario.
Superseded by [[DEC-0007]]; the JSON/JSONL export remains for jq users.
