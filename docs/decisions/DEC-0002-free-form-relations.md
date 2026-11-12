---
id: DEC-0002
kind: decision
title: Free-form node kinds and relation names
status: accepted
category: architecture
date: 2026-11-04
deciders: [architecture]
iteration: I1
---

# Free-form node kinds and relation names

## Context

Every team describes its system differently: one says `realized-by`, another `implemented-in`;
one models capabilities and value streams, another bounded contexts and ports. A fixed metamodel
(a closed set of node types and verbs) forces translation, and agents exploring ad hoc stumble on
vocabulary they were not told about.

## Options

1. A fixed metamodel (ArchiMate-, C4- or SysML-style typed elements and relations).
2. A fixed core with extension points.
3. Free-form: `kind` and relation names are strings chosen by authors; conventions, not schema.

## Decision

Option 3. The graph has nodes (`id`, `kind`, `title`, attributes) and edges (`from`, `rel`, `to`,
attributes), and no code path depends on a closed vocabulary. The few conventions the tool reads
are documented in the [[GLOSSARY]] and configurable where it matters ([[REQ-configuration]]).
Queries treat relation names as data (`-a|b->`, `-*->`).

## Consequences

- Typos create new relations instead of errors. `sdp status` lists relations in use with counts,
  which makes outliers easy to spot; `sdp check` catches every reference to a missing node.
- Inverse relations are not materialised: traverse either direction with `<-rel-` or `-rel-`.

~~~gherkin
Scenario: Every reference resolves
  Then the query "missing" returns no results
~~~
