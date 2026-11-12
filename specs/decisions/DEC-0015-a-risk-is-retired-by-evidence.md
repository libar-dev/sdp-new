---
id: DEC-0015
kind: decision
title: A risk says what retires it and by when, and evidence retires it
status: accepted
category: process
date: 2026-11-12
deciders: [team]
iteration: I1
links:
  refines: DEC-0007
---

# A risk says what retires it and by when, and evidence retires it

## Context

Risks decide the order of the phases ([[DEC-0007]]), so the gates have to see them. And "retired"
must not be a word someone forgets to update, or writes too early.

## Options

1. **A risk list in prose.** Readable, invisible to every gate, stale within weeks.
2. **Risk specs with a status and an exposure rating**, and a gate on the rating: "no
   high-exposure risk is open". What this repository did. No risk was rated high, so the gate
   passed on its first day; and `accepted` meant one thing on a risk and another on a decision.
3. **Risk specs that link to what retires them and to the milestone by which**, with a status
   vocabulary of their own, and retirement checked against results.

## Decision

Option 3. A risk is a spec of kind `risk`:

| It says | With |
| --- | --- |
| what it threatens | `affects` links |
| what work retires it | `mitigated-by` links |
| by which milestone | a `due` link |
| where it stands | `status`: `open`, `retired` or `tolerated` |

A risk is not planned work; its mitigation is. `retired` may be written only once that work is
verified, and a milestone's gate requires the risks due at it to be retired. `tolerated` means we
live with what is left and watch for it: such a risk promises no date.

## Consequences

- A gate sees exactly the risks its phase is meant to retire:
  `sdp q 'risk -due-> milestone' --paths`.
- `exposure` (high, medium, low) stays as a reading aid. No gate depends on a rating.
- Risk statuses share no word with decision statuses.

~~~gherkin
Scenario: Every risk says what it threatens and where it stands
  Then the query "risk" returns at least 1 result
  And the query "risk !-affects-> *" returns no results
  And the query "risk[status!=open|retired|tolerated]" returns no results

Scenario: An open risk names the work that retires it and the milestone by which
  Then the query "risk[status=open] !-mitigated-by-> *" returns no results
  And the query "risk[status=open] !-due-> milestone" returns no results

Scenario: A tolerated risk promises no date
  Then the query "risk[status=tolerated] ?-due-> milestone" returns no results

@gate
Scenario: A risk is retired only by verified work
  Then the query "risk[status=retired] -mitigated-by-> *[stage!=verified]" returns no results
~~~
