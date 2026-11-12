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
3. Keep Markdown and code as the only source; rebuild the graph in memory on every command.

## Decision

Option 3. Every command parses the workspace and builds the graph from scratch. What sdp writes
under `.sdp/` is derived and can be deleted: the id declarations (`sdp types`) and the exports
(`sdp graph --write`) are regenerated from the files, and the scenario results
(`.sdp/results.json`) by running again. Results are the one thing the files alone cannot give
back, so each records what it ran against and stops counting when that changes ([[DEC-0011]]).

## Consequences

- No migrations, no sync bugs, branches and merges just work.
- Every command's latency includes reading and parsing; [[NFR-query-performance]] and
  [[NFR-large-workspace]] keep us honest.
- Provenance is free: every node and edge carries the `file:line` it came from.

~~~gherkin
Scenario: The next command sees an edit, and a written export is never read back
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    ---
    # Alpha
    """
  When I run "sdp graph --write"
  And I run "sdp q requirement --ids"
  Then the output contains "REQ-a"
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-b
    ---
    # Beta
    """
  When I run "sdp q requirement --ids"
  Then the output contains "REQ-b"
  And the output does not contain "REQ-a"
~~~
