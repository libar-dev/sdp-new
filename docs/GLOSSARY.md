---
id: GLOSSARY
kind: glossary
title: Glossary
nodes:
  # Specifications and the graph
  - id: TERM-spec
    kind: term
    title: Specification (spec)
    definition: >-
      A Markdown file whose front matter has an `id`, or any `.feature` file — identified by its
      `@id:` tag, else as `feature:<path>`. Every artifact of delivery is one: an idea, a
      requirement, a decision, the plan, a milestone, a risk, this glossary. Each spec is a node of
      the graph.
    links: { specified-by: REQ-progressive-specs }
  - id: TERM-kind
    kind: term
    title: Kind
    definition: >-
      The type of a node in the authors' words (`requirement`, `decision`, `term`). Inferred from
      the id prefix when omitted ([[REQ-configuration]]). sdp reads meaning only into the kinds its
      vocabulary profile names.
    links: { specified-by: REQ-flexible-graph }
  - id: TERM-relation
    kind: term
    title: Relation
    definition: >-
      The name of an edge, chosen by its author (`refines`, `realized-by`, `decided-by`). sdp reads
      meaning only into the relations its vocabulary profile names; every other relation means what
      its authors say.
    links: { specified-by: REQ-flexible-graph }
  - id: TERM-vocabulary-profile
    kind: term
    title: Vocabulary profile
    definition: >-
      The few kinds, relations, attributes, statuses, maturity levels and disciplines sdp
      interprets, each a role with a default word a workspace can rename under `vocabulary:`.
      `sdp vocabulary` prints it.
    links: { specified-by: ARCH-vocabulary }
  - id: TERM-inline-node
    kind: term
    title: Inline node
    definition: >-
      A node declared in another spec's `nodes:` front matter list, for things too small for a
      file of their own: phases, iterations, principles, terms.
    links: { specified-by: ARCH-graph-builder }
  - id: TERM-link-key
    kind: term
    title: Link key
    definition: >-
      A front matter key whose values are links whatever they are: every entry of `links:`, the plan
      and phase relations, each discipline of `activity`, and a workspace's own `vocabulary.links`.
      Its targets must resolve, and it reads as an attribute too: `[iteration=E2]` agrees with
      `-iteration-> #E2`. Every other key is a value.
    links: { specified-by: ARCH-graph-builder }
  - id: TERM-mention
    kind: term
    title: Mention
    definition: >-
      A `[[ID]]` reference in prose. It becomes a `mentions` edge unless a link already joins the two
      nodes, and it is not a link: the `*` relation of a query, the architecture view and context
      reach do not follow it. `rel:: [[ID]]` writes a link instead.
    links: { specified-by: REQ-flexible-graph }
  - id: TERM-code-annotation
    kind: term
    title: Code annotation
    definition: >-
      A link from code to the graph. In TypeScript and JavaScript it is typed code,
      `annotate(target, { relation: "ID" })` from `sdp/annotations`, with ids checked by the compiler
      once `sdp types` has run; in other languages it is a comment `@sdp <relation> <ID>`. Either
      way the annotated declaration (or file) becomes a `code` node; an `is` link anchors a node in
      code and declares it if no spec does.
    links: { specified-by: ARCH-code-annotations }
  - id: TERM-dangling-link
    kind: term
    title: Dangling link
    definition: >-
      A reference to an id no node has. It stays visible as a node of kind `missing`, and every
      such reference is reported as an error where it is written.
    links: { specified-by: ARCH-graph-builder }
  - id: TERM-sdpq
    kind: term
    title: SDPQ
    definition: >-
      sdp's one-line path-pattern query language, borrowing Cypher's ASCII-art edges:
      `requirement[maturity<ready] -realized-by-> element !-decided-by-> decision`.
    links: { specified-by: REQ-graph-query }
  - id: TERM-workspace
    kind: term
    title: Workspace
    definition: >-
      The directory sdp reads, optionally configured by `sdp.config.yaml` (or `.yml`, `.json`) at
      its root.
    links: { specified-by: REQ-configuration }
  # Maturity and execution
  - id: TERM-maturity
    kind: term
    title: Maturity
    definition: >-
      How far a node's authoring has come: idea, draft, specified or ready, unless the workspace
      configures its own ladder. Authors declare it; `sdp check` verifies that it is on the ladder
      and that the content supports it.
    links: { specified-by: REQ-maturity-gates }
  - id: TERM-maturity-gate
    kind: term
    title: Maturity gate
    definition: >-
      What the content of a spec must have to claim a maturity level, such as a scenario with an
      outcome for `specified`. The gates are structural: they check the shape of the content,
      not its quality, so `ready` means nothing is left open, not that the design is settled.
    links: { specified-by: REQ-maturity-gates }
  - id: TERM-definition-of-ready
    kind: term
    title: Definition of Ready
    definition: >-
      What a team requires, beyond the structural `ready` gate, before work on a spec starts —
      accepted decisions, measurable quality requirements, a review. sdp has none built in; a team
      writes its own as a gate whose built-in steps query the graph.
    links: { specified-by: REQ-maturity-gates }
  - id: TERM-open-question
    kind: term
    title: Open question
    definition: >-
      A list item under an *Open questions*, *Questions*, *Unresolved* or *TBD* heading; `- [x]`
      or strike-through marks it resolved. A ready spec has none unresolved.
    links: { specified-by: REQ-progressive-specs }
  - id: TERM-scenario
    kind: term
    title: Scenario
    definition: >-
      A Gherkin scenario in a spec: an example of behaviour, and a `scenario` node that
      `-verifies->` its spec. It executes once step definitions exist.
    links: { specified-by: REQ-progressive-specs }
  - id: TERM-pickle
    kind: term
    title: Pickle
    definition: >-
      The executable form of a scenario, compiled by the Cucumber parser. A Scenario Outline yields
      one pickle per example row.
    links: { specified-by: REQ-executable-specs }
  - id: TERM-step-definition
    kind: term
    title: Step definition
    definition: >-
      Code that gives a step its behaviour, matched by a Cucumber Expression or a regular
      expression, in a step module (`*.steps.ts` by default) that imports `sdp/steps`. Only a run
      imports step modules; every other command reads the definitions from the files.
    links: { specified-by: REQ-executable-specs }
  - id: TERM-world
    kind: term
    title: World
    definition: >-
      The state the steps of one scenario share. Each scenario gets a fresh world; step modules
      that use the same world factory share one.
    links: { specified-by: REQ-executable-specs }
  - id: TERM-undefined-step
    kind: term
    title: Undefined step
    definition: >-
      A step no definition matches: behaviour not automated yet, not a failure. sdp suggests a
      definition for it.
    links: { specified-by: REQ-executable-specs }
  - id: TERM-built-in-step
    kind: term
    title: Built-in step
    definition: >-
      A step that ships with sdp and asserts against the project graph, such as
      `the query "…" returns no results`. Gates, guards and architecture rules are written with them.
    links: { specified-by: REQ-builtin-steps }
  - id: TERM-verification
    kind: term
    title: Verification
    definition: >-
      The roll-up of a spec's scenario results: none, unrun, undefined, pending, failing or passing.
      Passing — the stage `verified` — promises that every scenario of the spec passed against its
      evidence and that none of that has changed since; nothing wider.
    links: { specified-by: REQ-executable-specs }
  - id: TERM-evidence
    kind: term
    title: Evidence
    definition: >-
      What a scenario result ran against, recorded with it as fingerprints: the scenario as a
      handler sees it, tags included; the configuration, the code, the step files and every
      workspace file they imported; the sdp version, Node.js major version and lockfile; the files
      and environment variables the workspace declares under `evidence`; for a scenario that read
      the graph the specs, and for a gate the ordinary results. A result whose evidence no longer
      matches the workspace is stale (`staleBecause` names what changed) and counts as unrun.
    links: { specified-by: REQ-executable-specs, decided-by: DEC-0011 }
  - id: TERM-stage
    kind: term
    title: Stage
    definition: >-
      Where a node with a maturity or scenarios is in delivery: verified when all its scenarios
      pass, failing when any fails, in-progress while automation is partial, otherwise its
      declared maturity. Derived from evidence, never declared; failing ranks with in-progress.
    links: { specified-by: REQ-executable-specs }
  # Quality, decisions and architecture
  - id: TERM-quality-attribute-scenario
    kind: term
    title: Quality attribute scenario
    definition: >-
      A quality requirement written as a scenario: Given the source, environment and artifact,
      When the stimulus, Then the response and its measure.
    links: { specified-by: REQ-quality-scenarios }
  - id: TERM-fitness-function
    kind: term
    title: Fitness function
    definition: >-
      An automated check that the system keeps an architectural or quality property: an automated
      quality attribute scenario, or a rule over the graph.
    links: { specified-by: REQ-quality-scenarios }
  - id: TERM-decision-record
    kind: term
    title: Decision record
    definition: >-
      A spec of kind `decision` with context, options, the decision and its consequences, a
      `status` and a free `category`.
    links: { specified-by: REQ-decision-records }
  - id: TERM-guard-scenario
    kind: term
    title: Guard scenario
    definition: >-
      A scenario in a decision record that checks the decision still holds.
    links: { specified-by: REQ-decision-records }
  - id: TERM-architecture
    kind: term
    title: Architecture
    definition: >-
      Every node of an architectural kind — elements and patterns — in the graph. The graph is
      curated: what an architect declares or anchors in code is, by that act, significant, and sdp
      never computes, ranks, limits or suggests what belongs in it.
    links: { specified-by: REQ-curated-architecture }
  - id: TERM-element
    kind: term
    title: Element
    definition: >-
      A part of the system an architect declared as a node of kind `element`: a component, module
      or service that shapes the architecture. Its description says why.
    links: { specified-by: REQ-curated-architecture }
  - id: TERM-pattern
    kind: term
    title: Pattern
    definition: >-
      A node of kind `pattern`; elements that apply it link to it, conventionally with
      `instance-of`.
    links: { specified-by: REQ-curated-architecture }
  - id: TERM-architectural-driver
    kind: term
    title: Architectural driver
    definition: >-
      A decision or quality requirement linked to the architecture; the architecture view shows it
      next to what it shapes.
    links: { specified-by: REQ-curated-architecture }
  - id: TERM-context-bundle
    kind: term
    title: Context bundle
    definition: >-
      Everything needed to work on one node, as one Markdown document: the spec, its links,
      scenario status, the architecture and decisions within reach, and linked code.
    links: { specified-by: REQ-agent-context }
  # Lifecycle
  - id: TERM-phase
    kind: term
    title: Phase
    definition: >-
      One of the RUP phases (Inception, Elaboration, Construction, Transition): a node of kind
      `phase`, ordered by `order`, split into iterations and ended by a milestone.
    links: { specified-by: REQ-lifecycle-view }
  - id: TERM-iteration
    kind: term
    title: Iteration
    definition: >-
      A time box within a phase, with `start` and `end` dates. Work is planned into it by setting
      `iteration:` on a spec, decision or element, or by naming it in the node's `activity:`.
    links: { specified-by: REQ-lifecycle-view }
  - id: TERM-milestone
    kind: term
    title: Milestone
    definition: >-
      The end of a phase (LCO, LCA, IOC, PR): a spec of kind `milestone` whose scenarios are its
      gate. It is met when the gate passes, never because the calendar has moved past its phase.
    links: { specified-by: REQ-lifecycle-view }
  - id: TERM-diagnostic
    kind: term
    title: Diagnostic
    definition: >-
      A problem `sdp check` reports: a rule id, a severity (error, warning or info), the
      `file:line` where it is, and a hint saying how to fix it. Only errors fail the check.
    links: { specified-by: REQ-check-rules }
  - id: TERM-gate
    kind: term
    title: Gate
    definition: >-
      The scenarios that run after all others: a milestone's, which decide whether it is met,
      and any tagged `@gate`. Only a gate sees results — those of the ordinary scenarios, never a
      gate's — so a scenario that asserts on delivery state is a gate. No gate fails `sdp run`,
      whatever its phase or the date; `sdp gate <id>` exits with 1 while that milestone's or
      spec's gate is unmet.
    links: { specified-by: REQ-executable-specs }
  - id: TERM-discipline
    kind: term
    title: Discipline
    definition: >-
      A kind of delivery work (business modeling, requirements, analysis and design,
      implementation, test, deployment). Its activity per iteration is planned: a node's
      `iteration:` plans the work of the discipline its kind belongs to, and `activity:` plans
      any discipline into iterations of its own.
    links: { specified-by: REQ-lifecycle-view }
  # Vision
  - id: TERM-capability
    kind: term
    title: Capability
    definition: >-
      A business goal the product serves; requirements refine it.
    links: { specified-by: VISION }
  - id: TERM-principle
    kind: term
    title: Principle
    definition: >-
      A rule the design follows, resting on the decision that made it.
    links: { specified-by: VISION }
  - id: TERM-risk
    kind: term
    title: Risk
    definition: >-
      A threat to delivery, with a `status` (open, mitigated, accepted) and an `exposure` (high,
      medium, low), linked with `affects` to what it threatens and with `mitigated-by` to what
      reduces it.
    links: { specified-by: DEC-0007 }
---

# Glossary

The words specs use with a specific meaning. Each term is a node: `sdp q 'term'` lists them,
`sdp show TERM-maturity` shows one, and every term points to the spec that specifies the behaviour
behind it.

## Attributes

Front matter keys become attributes of their node.

**Reserved keys** shape the node itself: `id`, `kind`, `title`, `links`, `nodes`. sdp also always
reads `maturity` (the authoring ladder), `status` (of decisions) and `tags`.

**Interpreted words** — the kinds, relations, attributes and statuses sdp reads meaning into — are
the vocabulary profile's ([[ARCH-vocabulary]]); `sdp vocabulary` prints them with their roles.

**This repository's conventions** mean nothing to sdp; any other key is equally valid and simply
carried along:

| Attribute | On | Meaning |
| --- | --- | --- |
| `quality` | quality requirements | the quality attribute: performance, modifiability, … |
| `category` | decisions | architecture, product, process, technology, organization, … |
| `date`, `deciders` | decisions | when and by whom |
| `role` | `instance-of` links | the element's role in the pattern |
| `exposure` | risks | high, medium, low |
| `definition` | terms | what the term means |

**Derived attributes** are computed; writing one is a `derived-attribute` error:

| On | Attributes |
| --- | --- |
| every spec | `file`; `summary`, the first paragraph; `scenarios`, their count; `verification`; `stage`; `openQuestions`, the number unresolved |
| inline nodes and nodes declared in code | `declaredIn`, the spec that declares them or `code`; `stage` |
| scenarios | `spec`, `keyword`, `tags`, `rule`, `steps`, `examples`, `status`, `staleBecause`, `lastRun`, `hash` |
| code nodes | `file`, `symbol`, `doc` |
| edges | `sources`, every declaration that states the edge |

## Scenarios

~~~gherkin
Scenario: Every term is defined
  Then the query "term[!definition]" returns no results

Scenario: Every term points to the spec that specifies it
  Then the query "term !-specified-by-> *[file]" returns no results

Scenario: Every attribute sdp derives is listed here
  Then this glossary lists every attribute sdp derives
~~~
