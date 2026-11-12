---
id: DEC-0005
kind: decision
title: Maturity is declared and checked; delivery stage is derived from evidence
status: accepted
category: product
date: 2026-11-06
deciders: [product]
iteration: I1
---

# Maturity is declared and checked; delivery stage is derived from evidence

## Context

Status fields rot. A requirement marked "done" whose tests fail, or "in analysis" whose tests pass,
misleads everyone, agents included. Yet some judgement — is this idea understood well enough? —
cannot be computed.

## Options

1. **One declared status** (`status: in-analysis | in-progress | done`), as most trackers have.
2. **Everything derived**: no declared field at all; read readiness from content alone.
3. **Two axes**: authors declare the authoring maturity and a tool checks it against the content;
   whether the behaviour works is derived from scenario results and cannot be declared.

## Decision

Option 3. Authors declare *maturity* (`idea`, `draft`, `specified`, `ready`, or the workspace's own
ladder); `sdp check` verifies that it is on the ladder and that the content supports it. Nobody
declares that something works: `verification` is derived from scenario results, and writing a
derived fact is an error. `stage` sums the two up in one word — `verified` when all scenarios pass,
`failing` when any fails, `in-progress` while automation is partial, otherwise the declared maturity
([[REQ-maturity-criteria]]).

## Consequences

- "Done" means verified scenarios, nothing else, and a regression shows as `failing`, not as work in
  progress.
- The built-in maturity criteria are structural: `ready` means nothing is left open, not that the
  design is settled. What else a team requires before work starts is its own Definition of Ready,
  written as a gate ([[REQ-maturity-criteria]]).

~~~gherkin
Scenario: Nobody can declare that a requirement works
  Given a file "specs/REQ-export.md" containing:
    """
    ---
    id: REQ-export
    maturity: draft
    stage: verified
    ---
    # Export

    Orders can be exported.
    """
  When the workspace is checked
  Then the check reports "derived-attribute" for "REQ-export"
  And node "REQ-export" has attribute stage = "draft"
~~~
