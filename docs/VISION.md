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
    links: { decided-by: [DEC-0005, DEC-0007] }
  - id: PRIN-free-form-graph
    kind: principle
    title: The graph speaks the team's language
    links: { decided-by: DEC-0002 }
  - id: PRIN-architects-decide
    kind: principle
    title: Significance is the architect's call
    links: { decided-by: DEC-0008 }
  - id: PRIN-agent-native
    kind: principle
    title: Agent-native
    links: { decided-by: [DEC-0003, DEC-0004, DEC-0006] }
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
decisions, architecture and the plan. Unlike an architecture repository, it shows only what
architects marked significant, connected to the decisions and evidence behind it. It is built for
agents as much as for people.

## Principles

1. **Files are the source of truth.** Markdown, `.feature` files and code comments; the graph is
   a derived index, rebuilt on every command. Git, pull requests, grep and editors work on
   everything ([[DEC-0003]]).
2. **One format for everything, at every maturity.** An idea and an implemented feature differ in
   content, not in format or tool; decisions, the plan, milestones and risks are written the same
   way ([[DEC-0001]]).
3. **Evidence over status fields.** Authors declare maturity and the tool checks it. Nobody
   declares a requirement done or a milestone met: scenario results decide ([[DEC-0005]],
   [[DEC-0007]]).
4. **The graph speaks the team's language.** Kinds and relations are the authors' words, not a
   metamodel ([[DEC-0002]]).
5. **Significance is the architect's call.** Few abstractions are architecture; architects mark
   them, and the tool shows them without computing, limiting or checking significance
   ([[DEC-0008]]).
6. **Agent-native.** Everything is reachable with grep and jq, a `--json` CLI and MCP; every fact
   carries the `file:line` it came from; queries fit on one line; the tool runs from source, so
   agents run what they edit ([[DEC-0003]], [[DEC-0006]], [[DEC-0004]]).

## Capabilities

| Capability | What it gives |
| --- | --- |
| [[CAP-living-specs]] | Specifications that grow from an idea to executable behaviour, and a plan read from evidence |
| [[CAP-curated-architecture]] | The significant architecture, justified and linked to its decisions and drivers |
| [[CAP-agent-collaboration]] | The whole delivery state for agents, through the tools they already use |

`sdp q '#CAP-living-specs <-refines- *'` lists what refines a capability.

## Finding your way

Every spec has a literal id: `grep -rn <ID>` finds it and everything that mentions it, and
`sdp context <ID>` gathers what is needed to work on it.

| Where | What |
| --- | --- |
| `docs/VISION.md` | this vision: problem, principles, capabilities |
| [[GLOSSARY]] (`docs/GLOSSARY.md`) | the terms used across specs, and the attributes sdp reads or derives |
| `specs/capabilities/` | capabilities (`CAP-*`) |
| `specs/requirements/` | functional requirements (`REQ-*`) |
| `specs/quality/` | quality requirements as quality attribute scenarios (`NFR-*`) |
| `specs/ideas/` | ideas and drafts, deliberately unfinished |
| `specs/steps/` | step definitions that run the scenarios against the real pipeline |
| `docs/decisions/` | decisions of every category (`DEC-*`) |
| `docs/architecture/` | the curated architecture: elements and patterns (`ARCH-*`, `PAT-*`) |
| `docs/delivery/` | the [[PLAN]] (phases, iterations) and milestone gates (`MS-*`) |
| `docs/risks/` | risks (`RISK-*`) |
| `README.md`, `AGENTS.md` | guides for people and for agents |
| `examples/shop/` | a conventional product specified with sdp |

## Scenarios

~~~gherkin
Scenario: Every principle rests on a decision
  Then the query "principle !-decided-by-> decision" returns no results

Scenario: The vision maps every capability
  Then the query "capability !<-*- #VISION" returns no results
~~~
