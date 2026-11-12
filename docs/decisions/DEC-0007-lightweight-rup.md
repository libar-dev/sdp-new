---
id: DEC-0007
kind: decision
title: Lightweight RUP lifecycle with executable milestone gates
status: accepted
category: process
date: 2026-09-02
deciders: [team]
iteration: I1
links:
  affects: [REQ-lifecycle-view]
---

# Lightweight RUP lifecycle with executable milestone gates

## Context

A process decision, not an architectural one. We want risk-driven phases (Inception, Elaboration,
Construction, Transition) without RUP's document load, and milestones that are checked, not
declared.

## Decision

- Two-week iterations: I1 · E1 E2 · C1–C4 · T1 T2.
- Each phase ends in a milestone — LCO, LCA, IOC, PR — whose gate is a set of scenarios over the
  graph (`sdp gate MS-LCA`).
- Disciplines are not scheduled; their activity per iteration is derived from what is planned.

## Consequences

- Elaboration ends only when the architecture baseline is curated and justified, by construction.
- Gates of future milestones fail until their time; `sdp run` reports them but does not fail on
  them, `sdp gate` does, and `sdp lifecycle` shows them as *not due* until their phase starts.
