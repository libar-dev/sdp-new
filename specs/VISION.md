---
id: VISION
kind: vision
iteration: I1
links:
  principle: [DEC-0001, DEC-0002, DEC-0003, DEC-0005, DEC-0006, DEC-0007, DEC-0008]
---

# Vision

sdp manages software delivery end to end. Requirements at every maturity, quality requirements,
decisions, the curated architecture and the delivery lifecycle form one graph — written as plain
files next to the code, checked by rules, and executable wherever behaviour can be verified.

## The problem

Delivery knowledge is scattered. Ideas sit in a tracker, requirements in a wiki, acceptance tests
in the code, decisions in meeting notes or nowhere, and the architecture in diagrams that stopped
being true. Each place has its own status field that someone must remember to update, and none of
them knows whether the system does what was asked. People struggle to see the whole; AI agents,
which now do much of the work, cannot see it at all.

## Who it is for

- **Product owners and analysts** capture an idea in one line and grow it into a specification
  without changing tools.
- **Architects** name the few elements that shape the system, record why, and keep decisions next
  to what they affect.
- **Developers and testers** get acceptance tests that are the specification, not a copy of it.
- **Delivery leads** plan iterations and see milestones met or missed by evidence.
- **AI agents** read, query and change all of it with grep, a CLI or MCP.

## Positioning

sdp sits where requirements tools, BDD runners and architecture repositories overlap, and keeps
what each does well in one graph. Unlike a requirements tool, it keeps specifications in the
repository and runs them. Unlike a BDD runner, it also holds ideas, quality requirements,
decisions, architecture and the plan. Unlike an architecture repository, it holds only what
architects declared, connected to the decisions and evidence behind it.

## Principles and capabilities

The principles are the decisions this vision links to, and three capabilities refine it:
`sdp q '#VISION -principle-> decision'`, `sdp q 'capability -refines-> #VISION'`.

~~~gherkin
Scenario: Every decision is one that something rests on
  Then the query "decision" returns at least 1 result
  And the query "decision !<-decided-by- *" returns no results
~~~
