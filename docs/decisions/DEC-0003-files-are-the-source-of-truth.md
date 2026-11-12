---
id: DEC-0003
kind: decision
title: Files are the source of truth; the graph is a derived index
status: accepted
category: architecture
date: 2026-11-04
deciders: [architecture]
iteration: I1
---

# Files are the source of truth; the graph is a derived index

## Context

The graph must be queryable as a whole, yet people and agents edit specs with ordinary tools and
review them in pull requests. A database would give fast queries and a schema, at the price of a
second copy of the truth, migrations, and invisibility to grep and git.

## Options

1. Store the graph in a database (SQLite, a graph DB) and edit it through the tool.
2. Keep Markdown as the source and synchronise a database from it.
3. Keep Markdown and code comments as the only source; rebuild the graph in memory on every command.

## Decision

Option 3. Every command parses the workspace and builds the graph from scratch; `sdp graph`
prints it as one JSON record per line for tools that prefer plain data. Scenario results are the only persisted state,
in `.sdp/results.json`, recorded with each scenario's hash and fingerprints of what it ran against,
so any change to the scenario, the code, the step definitions, the toolchain, the declared inputs
or (for graph assertions) the specs invalidates them ([[DEC-0011]]).

## Consequences

- No migrations, no sync bugs, branches and merges just work.
- Every command's latency includes reading and parsing; [[NFR-query-performance]] and
  [[NFR-large-workspace]] keep us honest.
- Provenance is free: every node and edge carries the `file:line` it came from.
