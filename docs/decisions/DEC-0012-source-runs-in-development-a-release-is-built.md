---
id: DEC-0012
kind: decision
title: Source runs directly in development; a release emits JavaScript and declarations
status: accepted
category: technology
date: 2026-11-12
deciders: [engineering]
iteration: I1
links:
  refines: DEC-0004
---

# Source runs directly in development; a release emits JavaScript and declarations

## Context

People and agents change sdp and run it at once. A build between an edit and its effect means
output that can be stale, a watch mode to forget and source maps to read errors through.
Node.js 24 runs TypeScript sources directly when they use only syntax it can erase.

It does so everywhere but under `node_modules`: an installed package cannot run from TypeScript
sources. And a workspace that type-checked sdp's sources would apply its own ids to sdp's
annotations ([[DEC-0009]]). So what runs in this repository cannot be what is installed.

## Options

1. **Build always**: compile to `dist/` and run that, here too. One way to run everywhere; every
   edit needs a build or a watcher, and stale output runs without anyone noticing.
2. **A loader everywhere** (`tsx`, `ts-node`), installed copies included. No build; every user
   pays a run-time dependency and a slower start.
3. **A runtime that runs TypeScript anywhere** (Bun, Deno). No build; narrows who can install the
   tool ([[DEC-0004]]).
4. **Source in development, a build only to release.** The repository runs its `.ts` files with
   nothing in between; packing a release emits JavaScript and declarations, and that is what gets
   installed.

## Decision

Option 4. In this repository `sdp` is `node src/cli/main.ts`, and `bin` and `exports` in
`package.json` name the sources. The sources use erasable syntax only and import with `.ts`
extensions. A release compiles them to JavaScript and declarations; building and publishing it is
[[REQ-npm-package]], planned and not built yet.

## Consequences

- No `dist/` here, no watch mode, no source maps: what is edited is what runs
  ([[NFR-no-build-step]]).
- Enums, namespaces, parameter properties and decorators are off-limits; the compiler rejects them
  (`erasableSyntaxOnly`).
- Until [[REQ-npm-package]] is built, sdp runs only from a clone.
- A release is a second way to run sdp, so it has to be shown to behave like the sources that
  were verified — an open question of [[REQ-npm-package]].
