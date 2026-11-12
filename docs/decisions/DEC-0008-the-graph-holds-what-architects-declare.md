---
id: DEC-0008
kind: decision
title: The architecture is what architects declare
status: accepted
category: architecture
date: 2026-11-12
deciders: [product, architecture]
iteration: I1
---

# The architecture is what architects declare

## Context

sdp is architecture-focused delivery. Architecting is making decisions about the architecturally
significant parts of a system: the few elements and patterns that carry quality attributes, are
expensive to change or constrain many others. Architecture descriptions fail when they list every
abstraction, because those few get buried among design detail. Which parts they are is a judgement
that depends on the system's drivers and risks; no count, ratio or metric decides it. Tools that
harvest every abstraction from code exist already; sdp is not one of them.

## Options

1. Harvest every abstraction from code, and infer which matter from metrics (fan-in, churn, size).
2. Declare many elements and let architects mark the significant ones with a flag.
3. Declare only what is significant: an element or a pattern is in the graph because an architect
   put it there, in a spec or with an `is` annotation in code.

## Decision

Option 3. The graph is curated and opinionated: what architects declare or anchor in code is, by
that act, significant, so there is no significance flag. The architecture is every node of an
architectural kind ([[ARCH-vocabulary]]). Why an element matters is said by its own description and
by its links to decisions and quality requirements. sdp never computes, ranks, limits or suggests
what belongs in the architecture: adding or removing an element, a pattern or an `is` annotation is
the architects' call, and agents propose rather than do it. `sdp arch`, context bundles and the MCP
server show the architecture with the decisions and quality requirements linked to it.

## Consequences

- The architecture view stays as small as the architects keep the graph.
- A rule about the architecture is the team's own scenario, e.g. in a milestone gate:
  `Then the query "element !-*- decision|nfr" returns no results`.
- Code that matters to nobody's architecture stays out of the graph; annotating it is a design
  statement, not bookkeeping.
