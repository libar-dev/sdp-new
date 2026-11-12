---
id: GLOSSARY
kind: glossary
title: Glossary
---

# Glossary

One word for one thing. Each entry says what the word means here and names the spec that
specifies the behaviour behind it. The words sdp itself reads meaning into are a short list of
their own: `sdp vocabulary` prints them ([[ARCH-vocabulary]]).

## The graph

| Word | Means |
| --- | --- |
| **spec** | A Markdown file whose front matter has an `id`, or a `.feature` file. Every artifact of delivery is one, and each is a node ([[REQ-progressive-specs]]). |
| **kind** | What a node is, in its authors' words. Read from the id prefix when `kind:` is omitted ([[REQ-configuration]]). `scenario`, `code` and `missing` are the kinds sdp makes itself; no author writes them. |
| **inline node** | A node declared in another spec's `nodes:` list, for things too small for a file: phases, iterations, principles ([[ARCH-graph-builder]]). |
| **link**, **link key** | A front matter key whose values always link: every key under `links:`, the plan and phase relations, each discipline of `activity`, and a workspace's own `vocabulary.links`. Its target must exist, and it reads as an attribute too — the key holds its targets — so no link is named like an attribute. Any other key is a value ([[ARCH-graph-builder]]). |
| **relation** | The name of a link, chosen by its author: `refines`, `realized-by`, `decided-by` ([[REQ-flexible-graph]]). |
| **mention** | A `[[ID]]` in prose. It is recorded, and it is not a link: the `*` of a query does not follow it ([[REQ-flexible-graph]]). |
| **annotation**, **anchor** | A link written in code: `annotate(target, { relation: "ID" })`, or an `@sdp relation ID` comment. The anchor is the `is` annotation: it says which code an element is ([[ARCH-code-annotations]]). |
| **SDPQ** | The one-line path-pattern query language ([[REQ-graph-query]]). |

## Maturity and evidence

| Word | Means |
| --- | --- |
| **maturity** | How far the writing of a spec has come: idea, draft, specified, ready. The author declares it and `sdp check` checks it ([[REQ-maturity-criteria]]). |
| **maturity criteria** | What the content must have to claim a level. They check shape, not quality, and they are not a gate. |
| **Definition of Ready** | What a team requires beyond the criteria before work starts. sdp has none built in: the team writes it as a gate ([[REQ-maturity-criteria]]). |
| **scenario** | A Gherkin scenario in a spec, and a node named `<spec id>#<slug of its name>` ([[ARCH-spec-parser]]). |
| **step definition** | Code that gives a step its behaviour. A **built-in step** ships with sdp and asserts on the graph ([[REQ-executable-specs]], [[REQ-builtin-steps]]). |
| **undefined** | The status of a step no definition matches: not automated yet, never a failure. |
| **pending** | The status of a step whose definition answered `pending()`: recognised, deliberately unfinished. Only a step and its scenario are pending; a spec is `partial`. |
| **status** | Of a scenario: the outcome of its last run, derived. Of a decision or a risk: declared, each with words of its own — proposed, accepted, … for a decision; open, retired, tolerated for a risk ([[REQ-decision-records]], [[PLAN]]). |
| **evidence** | The recorded scenario results, each with fingerprints of what it ran against. A result whose fingerprints no longer match the workspace is stale and counts as not run ([[DEC-0010]]). |
| **verification** | A spec's scenario statuses rolled up: none, unrun, undefined, partial, failing or passing ([[REQ-executable-specs]]). |
| **stage** | Maturity and verification in one word: verified, failing, in-progress, or else the declared maturity. Never declared ([[DEC-0005]]). |
| **gate** | A scenario that runs after the ordinary ones and may read their results: every scenario of a milestone, and any scenario tagged `@gate`. Every run reports it; `sdp gate` enforces it ([[REQ-cli]]). Nothing else is called a gate. |
| **guard** | An ordinary scenario in a decision record: it fails the run when the decision no longer holds ([[REQ-decision-records]]). |
| **diagnostic** | A problem `sdp check` reports: a rule id, a severity, a `file:line` and a hint. Only errors fail the check ([[REQ-check-rules]]). |

## Quality, decisions and architecture

| Word | Means |
| --- | --- |
| **quality requirement** | A requirement on how well, not on what: a spec of kind `nfr` (ids `NFR-…`), written as quality attribute scenarios. Always called this in prose ([[REQ-quality-scenarios]]). |
| **quality attribute scenario** | Given the source and environment, When the stimulus, Then the response and its measure. Automated, it is a **fitness function**. |
| **decision** | A spec of kind `decision`: context, options, the decision, its consequences, a `status` and a free `category` ([[REQ-decision-records]]). |
| **architecture** | Every element and pattern in the graph. What an architect declares or anchors is, by that act, significant; sdp never computes or suggests it ([[DEC-0008]]). |
| **driver** | A decision or quality requirement linked to the architecture; the view shows it next to what it shapes ([[REQ-curated-architecture]]). |
| **context bundle** | Everything needed to work on one node, as one Markdown document ([[REQ-agent-context]]). |

## Delivery

| Word | Means |
| --- | --- |
| **phase**, **iteration** | A phase (ids `PH-…`) is split into iterations, time boxes with `start` and `end`. Work is planned into an iteration ([[DEC-0007]]). |
| **milestone** | The end of a phase: a spec whose scenarios are its gate. Met when the gate passes, never by the calendar. |
| **discipline** | A kind of delivery work: requirements, analysis and design, implementation, test, … `iteration:` plans a node's own discipline, `activity:` the others ([[REQ-lifecycle-view]]). |
| **risk** | A threat to delivery that names what it threatens, what retires it and by which milestone ([[PLAN]]). |

## Attributes

Front matter keys become attributes of their node. `id`, `kind`, `title`, `links` and `nodes`
shape the node itself; `maturity`, `status` and `tags` are always read. The rest of what sdp
interprets is in the vocabulary profile.

**This repository's conventions** mean nothing to sdp; any other key is as valid:

| Attribute | On | Meaning |
| --- | --- | --- |
| `quality` | quality requirements | the quality attribute: performance, modifiability, … |
| `category`, `date`, `deciders` | decisions | what it is about, when and by whom |
| `role` | `instance-of` links | the element's role in the pattern |
| `exposure` | risks | high, medium, low — a reading aid, no gate reads it |
| `planned` | iterations | `after-the-fact` when the plan was written down after the work |

**Derived attributes** are computed, and writing one is a `derived-attribute` error:

| On | Attributes |
| --- | --- |
| every spec | `file`; `summary`, the first paragraph; `scenarios`, their count; `verification`; `stage`; `openQuestions`, the number unresolved |
| inline nodes and nodes declared in code | `declaredIn`, the spec that declares them or `code`; `stage` |
| scenarios | `spec`, `keyword`, `tags`, `rule`, `steps`, `examples`, `status`, `staleBecause`, `lastRun`, `hash` |
| code nodes | `file`, `symbol`, `doc` |

## Scenarios

~~~gherkin
Scenario: Every attribute sdp derives is listed here
  Then this glossary lists every attribute sdp derives

Scenario: A word this glossary replaced does not come back
  When I run "grep -rnE '[Mm]aturity gates?|NFRs' README.md AGENTS.md docs specs src examples --exclude GLOSSARY.md" in the repository
  Then the exit code is 1
~~~
