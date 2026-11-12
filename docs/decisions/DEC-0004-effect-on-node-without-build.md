---
id: DEC-0004
kind: decision
title: TypeScript with Effect 4 on Node.js 24, no build step
status: accepted
category: technology
date: 2026-09-18
deciders: [engineering]
iteration: E1
links:
  affects: [NFR-no-build-step, ARCH-runner, ARCH-workspace, ARCH-mcp]
---

# TypeScript with Effect 4 on Node.js 24, no build step

## Context

The tool is IO at the edges (files, step definition modules, MCP over stdio) around a pure core
(parsing, graph, queries, checks). Step definitions may be sync, async or effectful and need
timeouts and structured failure reporting.

## Decision

TypeScript on Effect 4: `FileSystem` and `Path` services at the edge (swappable for an in-memory
file system in tests and specs), `Schema` for config and results, `effect/cli` for the command
line, `effect/ai` McpServer for agent access, and plain functions for the pure core. The sources
use only erasable TypeScript syntax, so Node.js 24 runs them directly.

## Consequences

- No `dist/`, no watch mode, no source maps; agents run what they edit.
- Enums, namespaces and parameter properties are off-limits (`erasableSyntaxOnly`).
