---
id: DEC-0004
kind: decision
title: TypeScript on Effect 4 and Node.js 24
status: accepted
category: technology
date: 2026-11-05
deciders: [engineering]
iteration: I1
---

# TypeScript on Effect 4 and Node.js 24

## Context

The tool is IO at the edges (files, step definition modules, MCP over stdio) around a pure core
(parsing, graph, queries, checks). Step definitions may be sync, async or effectful and need
timeouts and structured failure reporting. Workspaces write their step definitions and typed
annotations ([[DEC-0009]]) in the language of their own code, and sdp has to load them.

## Options

**Language and runtime**

1. **Go or Rust.** One binary and a fast start. But step definitions and annotations are written
   in the workspace's language, so sdp would need a plugin protocol to run them, and typed
   `annotate()` calls could not exist.
2. **TypeScript on Bun or Deno.** Both run TypeScript as it is. Fewer teams have them installed,
   and a workspace's step definitions would have to run there too.
3. **TypeScript on Node.js 24.** The runtime most workspaces already have; the official Cucumber
   parser and expressions are libraries for it; it runs TypeScript sources directly.

**IO, errors and services**

1. **Plain `async`/`await`.** No dependency. Timeouts, interruption, typed errors and a file
   system that scenarios can swap for one in memory would each be written by hand.
2. **Effect 4.** Typed errors, interruption, services, `Schema`, a CLI and an MCP server from one
   library. It is young, and few contributors know it ([[RISK-0008]]).

## Decision

TypeScript on Node.js 24, with Effect 4 at the edges: `FileSystem` and `Path` services (swapped
for an in-memory file system in scenarios), `Schema` for the configuration and the results,
`effect/cli` for the command line and `effect/ai` for the MCP server. The core — parsing, the
graph, queries, checks — is plain functions.

## Consequences

- Scenarios run the real pipeline against files in memory, because the core never reaches for a
  file system.
- Effect's own documentation ships in `node_modules/effect`; contributors and agents read that,
  not memories of Effect 2 or 3.
- How the sources are run and shipped is a decision of its own: [[DEC-0012]].

~~~gherkin
Scenario: The core does no IO
  When I run "grep -rlE FileSystem|node:fs src/parse src/model src/graph src/check" in the repository
  Then the exit code is 1
~~~
