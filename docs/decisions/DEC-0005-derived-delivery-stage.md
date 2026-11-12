---
id: DEC-0005
kind: decision
title: Maturity is declared and checked; delivery stage is derived from evidence
status: accepted
category: product
date: 2026-09-30
deciders: [product]
iteration: E2
links:
  affects: [REQ-maturity-gates, REQ-executable-specs, ARCH-runner]
---

# Maturity is declared and checked; delivery stage is derived from evidence

## Context

Status fields rot. A requirement marked "done" whose tests fail, or "in analysis" whose tests pass,
misleads everyone, agents included. Yet some judgement — is this idea understood well enough? —
cannot be computed.

## Decision

Authors declare *authoring maturity* (`idea`, `draft`, `specified`, `ready`); `sdp check` verifies
the claim against the content. Nobody declares implementation status: `stage` becomes
`in-progress` or `verified` only from scenario results.

## Consequences

- "Ready" has a definition that a machine can check (a Definition of Ready as code).
- "Done" means verified scenarios, nothing else.
