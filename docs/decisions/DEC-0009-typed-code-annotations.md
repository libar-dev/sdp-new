---
id: DEC-0009
kind: decision
title: Code annotations are typed code where the language allows it
status: accepted
category: architecture
date: 2026-11-12
deciders: [product, architecture]
iteration: I1
---

# Code annotations are typed code where the language allows it

## Context

The architecture's abstractions live in code; the graph has to know which code they are,
and which patterns that code applies. Comment annotations (`// @sdp is ARCH-graph`) work in any
language but are invisible to the compiler: a misspelt id, a renamed class or an annotation that
drifted away from its declaration goes unnoticed until someone reads the graph. Meanwhile the JSDoc
on those abstractions already describes them, and that text never reached the graph.

## Options

1. **Comments only.** Language-agnostic and zero-cost, but untyped and bound by position.
2. **Decorators.** Typed, but they only apply to classes and members, are not erasable syntax
   (Node cannot run them from source, [[DEC-0012]]) and execute at run time.
3. **Sidecar files** mapping symbols to ids. Typed if generated, but the link lives away from the
   code and goes stale on renames.
4. **A typed identity call**, `annotate(target, links)` from `sdp/annotations`, placed next to the
   declaration and read statically.

## Decision

Option 4 for TypeScript and JavaScript; comment annotations stay for every other language, and
remain possible in TypeScript and JavaScript too.

- The target is a module-level declaration (or `import.meta` for the module), so renames and
  find-references include the annotation and its name identifies it within the file; a local or
  undeclared target is reported, never merged with another of the same name.
- `sdp types` generates a declaration that types the ids `annotate` accepts; `sdp check` reports
  when it is stale. Unknown ids are compile errors.
- sdp parses the source once (oxc-parser) and never executes it; only literal ids count, anything
  computed is reported. Comment annotations in these files are read from the parser's comments,
  so a string that looks like one is not; other languages are scanned line by line, best effort
  ([[ARCH-code-annotations]]).
- The annotated declaration's JSDoc becomes the `code` node's description.

## Consequences

- Application code imports `sdp/annotations`, a module with no imports and no run-time behaviour;
  shipping it on its own is part of [[REQ-npm-package]].
- Type-checking sdp's own sources inside another workspace would apply that workspace's ids to
  sdp's annotations; consumers need compiled declarations, again [[REQ-npm-package]].
- An `is` annotation declares an element where no spec does, so adding one is the architects' call
  like declaring it in a spec ([[DEC-0008]]); other annotations say where in the code the elements
  and their patterns are.
- Any relation can be annotated, a link from code straight to a requirement included
  (`implements`). sdp's own code does not use one. Its annotations name the architecture — `is`
  an element, `instance-of` a pattern — and a requirement names the element that realizes it, so
  the way from a requirement to its code is `-realized-by-> element <-is- code`. Annotating
  every function with what it implements would be bookkeeping, not architecture ([[DEC-0008]]).

~~~gherkin
Scenario: Every annotation in this repository is read, and its ids are typed
  Then the query "code -is-> element|pattern" returns at least 1 result
  And there are no diagnostics for rule "annotation-unreadable"
  And there are no diagnostics for rule "types-stale"

Scenario: Code links to the architecture, and a requirement reaches it through its element
  Then the query "code !-is|instance-of-> element|pattern" returns no results
  And the query "code ?-*-> requirement|nfr" returns no results
  And the query "requirement[maturity=ready] !-realized-by-> element" returns no results
~~~
