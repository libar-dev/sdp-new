---
id: DEC-0017
kind: decision
title: A scenario is identified by a slug of its name
status: accepted
category: architecture
date: 2026-11-12
deciders: [architecture]
iteration: I1
---

# A scenario is identified by a slug of its name

Taken in the prototype's code and recorded here afterwards.

## Context

A scenario's result is stored under its id, `sdp run <id>` selects it and people point at it. The
id has to survive edits that do not change which scenario it is, and be readable and writable by
hand.

## Options

1. **Its position** — `file:line`, or its index in the spec. Nothing to name, but every edit above
   it changes the id and orphans its result.
2. **An explicit tag** (`@id:guest-pays`). Survives a rename; one more thing to write and keep
   unique on every scenario, for the few that are ever renamed.
3. **A hash of its steps.** Survives a rename, changes with every edit of a step, and cannot be
   read.
4. **`<spec id>#<slug of the name>`.**

## Decision

Option 4: `REQ-cart#guest-pays-by-card`. The slug is the name in lower-case ASCII words joined by
`-`, at most 64 characters; a second scenario with the same slug in a spec gets `-2`
([[ARCH-spec-parser]]). Identity says which scenario a result belongs to. Whether the result still
counts is the hash's job, not the id's ([[DEC-0011]]).

## Consequences

- The id survives moving the scenario and editing its steps.
- Renaming a scenario makes it a new one: the old result is dropped with the old id.
- The id is not the literal name, so grep finds a scenario by its spec's id or by its name, not
  by its own id.
- Two scenarios with one name in a spec get ids that depend on their order. Give them distinct
  names.
