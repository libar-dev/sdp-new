---
id: ARCH-overview
kind: view
title: Architecture overview
nodes:
  - id: ARCH-graph-builder
    kind: element
    title: Graph builder
    links: { feeds: ARCH-graph }
  - id: ARCH-workspace
    kind: element
    title: Workspace IO
    links: { feeds: ARCH-spec-parser }
  - id: ARCH-checker
    kind: element
    title: Checker
    links: { reads: ARCH-graph }
  - id: ARCH-architecture-view
    kind: element
    title: Architecture view
    links: { reads: ARCH-graph }
  - id: ARCH-lifecycle
    kind: element
    title: Lifecycle view
    links: { reads: ARCH-graph }
  - id: ARCH-cli
    kind: element
    title: Command line
    links: { uses: [ARCH-query-engine, ARCH-runner, ARCH-checker] }
  - id: ARCH-mcp
    kind: element
    title: MCP server
    links: { uses: [ARCH-query-engine, ARCH-checker] }
---

# Architecture overview

A pipeline (see [[PAT-pipes-and-filters]]) from files to answers. Files are the only source of
truth; the graph is rebuilt on every command ([[PAT-derived-index]]).

```mermaid
flowchart LR
  files[(Markdown, .feature, code comments)] --> ws[Workspace IO] --> parser[Spec parser] --> builder[Graph builder] --> graph((System graph))
  graph --> query[Query engine] & checker[Checker] & runner[Scenario runner] & lifecycle[Lifecycle] & sig[Significance]
  runner -- results.json --> builder
  query & checker & runner --> cli[CLI] & mcp[MCP server]
```

Only the elements with `significant: true` (see `sdp arch`) are architecture; the elements declared
above are listed for orientation and are deliberately not significant.
