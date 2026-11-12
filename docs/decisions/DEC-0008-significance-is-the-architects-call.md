---
id: DEC-0008
kind: decision
title: Architectural significance is the architect's call
status: accepted
category: architecture
date: 2026-11-12
deciders: [product, architecture]
iteration: I1
---

# Architectural significance is the architect's call

## Context

Only a small share of a system's abstractions and patterns shape its architecture. Architecture
descriptions fail when they list everything, because the few elements that carry quality
attributes, are expensive to change or constrain many others get buried among design detail.
Which elements those are is a judgement that depends on the system's drivers and risks; no count
or ratio decides it.

## Options

1. Infer significance from code metrics (fan-in, churn, size).
2. Enforce a share of significant abstractions, as a ratio the tool checks.
3. Let architects mark significance explicitly; the tool records and shows it.

## Decision

Option 3. Architects mark elements and patterns `significant: true` and say why in `rationale`.
sdp never computes, limits or checks significance. It shows the curated set (`sdp arch`, context
bundles, MCP) together with the patterns it applies and the decisions and quality requirements
linked to it, and `sdp arch --candidates` may *suggest* elements worth a look.

## Consequences

- The architecture view stays as small as the architects keep it.
- Teams that want a rule of their own can write it as a scenario, e.g. in a milestone gate:
  `Then the query "*[significant] !-*- decision" returns no results`.
