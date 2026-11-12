---
id: DEC-0010
kind: decision
title: Evidence says what it ran against, in layers that do not read themselves
status: accepted
category: architecture
date: 2026-11-12
deciders: [product, architecture]
iteration: I1
links:
  refines: DEC-0005
---

# Evidence says what it ran against, in layers that do not read themselves

## Context

`verified` is derived from scenario results ([[DEC-0005]]), so it is worth exactly as much as the
claim "this result still holds". A result that outlives the code it ran against, that a concurrent
run can overwrite, or that depends on results it does not record, makes `verified` a memory, not a
fact. Three questions had to be settled together: how finely a result tracks its inputs, where
results live, and which results a scenario may read.

## Options

**How finely a result tracks what it ran against**

1. **One fingerprint per kind of input**, shared by every result: all code, the toolchain, the
   declared inputs, all specs. Cheap, impossible to get subtly wrong, and coarse: one edit to any
   code file makes every result stale.
2. **Per-scenario dependencies**: record the files each scenario actually loaded or read, and
   invalidate only those. Precise, but it needs instrumentation (loader tracing or coverage per
   scenario), cannot attribute work to one of several scenarios running at once, and still misses
   what is read through a service — so it would be both more machinery and a weaker promise.

**Where results live**

1. **One mutable file in the workspace**, committed under a lock. Greppable, one place to look,
   nothing to collect or prune; it is evidence about this checkout only.
2. **An immutable artifact per run, with a derived index.** The natural shape for exchanging
   evidence between machines and CI, but it needs a policy for which run counts, a place to keep
   the artifacts and a way to prune them — none of which a single checkout needs.

**Which results a scenario may read**

1. **Any, recording what it read.** A scenario that reads results depends on scenarios that may
   depend on it: there is no order in which to evaluate them, and a digest of "all results"
   changes whenever the scenario itself is recorded.
2. **A dependency graph between gates**, with cycles rejected. Expressive, and a second graph
   to author, check and explain.
3. **Two fixed layers.** Ordinary scenarios see no results; gates see the ordinary results and
   never a gate's.

## Decision

One fingerprint per kind of input; one file under a lock; two layers.

| Fingerprinted | Not fingerprinted |
| --- | --- |
| the scenario as a handler can observe it, tags included | prose around the scenario |
| the configuration, the code, the step files and every workspace file they import until the run ends | packages, except through the lockfile; files outside the workspace |
| the sdp version, the Node.js major version, the lockfile | the operating system, the Node.js minor version |
| the files and environment variables the workspace declares (`evidence.inputs`, `evidence.env`) | anything else a step reads while it runs: services, the clock, undeclared files |
| the specs, for a scenario that read the graph; the ordinary results, for a gate that did | |

`verified` promises that every scenario passed against the left column and that none of it has
changed, nothing wider ([[REQ-executable-specs]]). What a team cannot declare, it cannot claim.

## Consequences

- A scenario that asserts on delivery state is a gate; sdp says so when an ordinary scenario
  tries. Gates cannot build on gates: a milestone that needs another milestone's conditions states
  them itself.
- Every code change makes every result stale. That is the price of the cheap, safe fingerprint,
  and acceptable while a full run takes seconds; if it stops being so, per-scenario dependencies
  are the next option, not a finer hash.
- The results file is local evidence. Sharing it — between developers, or from CI — is not built;
  the open choices are in [[REQ-shared-evidence]].
- The evidence concepts live on the runner's side (`src/run/Evidence.ts`, `src/run/Store.ts`); the
  graph builder is told what the results say and places it on the nodes.

~~~gherkin
Scenario: The graph builder is told what the results say and never imports the runner
  When I run "grep -cF ../run/ src/graph/Build.ts" in the repository
  Then the exit code is 1
~~~
