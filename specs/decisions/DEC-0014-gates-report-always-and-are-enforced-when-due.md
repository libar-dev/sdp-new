---
id: DEC-0014
kind: decision
title: Every run reports the gates; only the due ones are enforced
status: accepted
category: product
date: 2026-11-12
deciders: [product]
iteration: I1
links:
  refines: DEC-0007
---

# Every run reports the gates; only the due ones are enforced

## Context

A gate asserts on delivery state, and for most of a project most gates are unmet: a later
milestone is supposed to be. If gates failed the run like other scenarios, the build would be red
until the release and red would mean nothing. But a gate nobody enforces can be broken unnoticed —
and the milestone that is due now is exactly the one that must not be.

## Options

1. **A gate fails `sdp run` like any scenario.** Red until the last milestone is met.
2. **A gate fails `sdp run` once its phase has begun.** The result of running the scenarios then
   depends on the date: the same commit passes today and fails tomorrow.
3. **`sdp run` reports gates and never fails on one; a separate command enforces them**, one by
   id or all that are due.

## Decision

Option 3. `sdp run` runs the gates last and reports each one, met or not, whatever its phase and
whatever the date. `sdp gate <id>` exits non-zero while that milestone's, or that spec's, gate is
unmet. `sdp gate --due` does so for the gates of the current and the past phases, and is part of
`npm run verify` here: breaking the milestone that is due fails the build ([[REQ-cli]]).

## Consequences

- `sdp run` stays green while later milestones are unmet. `sdp lifecycle` shows a gate of a later
  phase as *not due* and an unmet one of a past phase as *overdue*.
- A later gate that already passes has no unfinished work planned for it, which is worth a look
  at the plan.
- No gate reads another gate's result ([[DEC-0011]]): a milestone that needs an earlier
  milestone's condition states it itself.
