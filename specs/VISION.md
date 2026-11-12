---
id: VISION
kind: vision
title: Vision
iteration: I1
nodes:
  - id: PRIN-files-are-the-truth
    kind: principle
    title: Files are the source of truth
    links: { decided-by: DEC-0003 }
  - id: PRIN-one-format
    kind: principle
    title: One format for everything, at every maturity
    links: { decided-by: DEC-0001 }
  - id: PRIN-evidence-over-status
    kind: principle
    title: Evidence over status fields
    links: { decided-by: [DEC-0005, DEC-0007, DEC-0015] }
  - id: PRIN-free-form-graph
    kind: principle
    title: The graph speaks the team's language
    links: { decided-by: DEC-0002 }
  - id: PRIN-architects-decide
    kind: principle
    title: The architecture is what architects declare
    links: { decided-by: DEC-0008 }
  - id: PRIN-agent-native
    kind: principle
    title: Agent-native
    links: { decided-by: [DEC-0003, DEC-0006, DEC-0012] }
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

## Principles

1. **Files are the source of truth.** The graph is an index derived from them on every command,
   so git, pull requests, grep and editors work on everything.
2. **One format for everything, at every maturity.** An idea and a verified feature differ in
   content, not in format or tool; decisions, the plan, milestones and risks are written the same
   way.
3. **Evidence over status fields.** Authors declare maturity and the tool checks it. Nobody
   declares a requirement done, a milestone met or a risk retired: scenario results decide.
4. **The graph speaks the team's language.** Kinds and relations are the authors' words, not a
   metamodel.
5. **The architecture is what architects declare.** The tool shows it and never computes, ranks,
   limits or suggests what belongs in it.
6. **Agent-native.** Everything is reachable with grep and jq, a CLI and MCP; every fact carries
   the `file:line` it came from; the tool runs from source, so agents run what they edit.

Each principle is a node that rests on decisions, and a principle holds only as long as a
scenario says so: `sdp q 'principle -decided-by-> decision' --paths` leads to them.

## Capabilities

Three capabilities refine this vision, and requirements refine them:
`sdp q 'capability -refines-> #VISION'`, then `sdp q '#CAP-living-specs <-refines- *'`.

## Scenarios

~~~gherkin
Scenario: Every principle rests on a decision that a scenario guards
  Then the query "principle" returns at least 1 result
  And the query "principle !-decided-by-> decision[scenarios>=1]" returns no results
~~~
