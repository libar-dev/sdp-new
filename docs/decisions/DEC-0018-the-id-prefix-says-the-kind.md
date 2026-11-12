---
id: DEC-0018
kind: decision
title: The id prefix says the kind
status: accepted
category: architecture
date: 2026-11-12
deciders: [architecture]
iteration: I1
---

# The id prefix says the kind

Taken in the prototype's code and recorded here afterwards.

## Context

Every node needs an id and a kind. Most ids already begin with what the thing is — `REQ-`, `DEC-`
— so a `kind:` line next to the id says it twice, and the two can disagree.

## Options

1. **`kind:` always.** Nothing to configure, one more line in every file, and
   `id: REQ-x` with `kind: decision` is possible.
2. **The folder decides.** A move changes the kind, and an inline node has no folder.
3. **The id prefix decides**, through one map from kind to prefix; an explicit `kind:` wins.

## Decision

Option 3. `ids:` in the configuration maps each kind to its prefix. A node without a `kind:` gets
the kind of its prefix, and `sdp new` names new nodes with the same map
([[REQ-configuration]]). A prefix is letters only and belongs to one kind; an id whose prefix
maps to nothing is a `spec`.

## Consequences

- Every node of a kind is one grep away: `grep -rn "RISK-" docs`.
- One map serves two purposes. Changing a prefix changes what `sdp new` writes and how existing
  ids are read, so the old ids then need a `kind:`.
- An explicit `kind:` may contradict the prefix, and sdp does not object. This repository does:

~~~gherkin
Scenario Outline: An id with a prefix is of that prefix's kind, and the other way round
  Then every node matching "*[id~^<prefix>-[^#]*$]" also matches "<kind>"
  And every node matching "<kind>" also matches "*[id~^<prefix>-]"

  Examples:
    | prefix | kind        |
    | REQ    | requirement |
    | NFR    | nfr         |
    | DEC    | decision    |
    | ARCH   | element     |
    | PAT    | pattern     |
    | MS     | milestone   |
    | CAP    | capability  |
    | RISK   | risk        |
    | PH     | phase       |
~~~
