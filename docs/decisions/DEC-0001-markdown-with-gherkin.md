---
id: DEC-0001
kind: decision
title: Markdown with embedded Gherkin is the one specification format
status: accepted
category: architecture
date: 2026-11-03
deciders: [product, architecture]
iteration: I1
---

# Markdown with embedded Gherkin is the one specification format

## Context

One format has to cover a one-line idea, a requirement still full of questions, a fully designed
feature, a quality requirement, a decision record and a milestone gate — and the same text must
execute as a test once the behaviour exists, without being rewritten. It must be pleasant for
people, natural for LLMs to read and write, diff well in git, and be greppable.

## Options

1. **Plain Gherkin `.feature` files.** Executable and widely known. But a Feature without
   scenarios is an awkward place for an idea; structured metadata only fits in tags; prose,
   tables, diagrams and decision rationale have nowhere good to live; NFRs and decisions feel forced.
2. **Gauge-style Markdown specs** (`# Spec`, `## Scenario`, `* step`). Markdown-native and
   executable, but a small ecosystem, no Given/When/Then semantics, no Scenario Outline/Rule, and
   steps are indistinguishable from ordinary bullet lists.
3. **Cucumber's Markdown-with-Gherkin dialect** (`# Feature:` headings, `* Given` list items). Close
   to what we want, but it turns every heading and bullet into syntax, so ordinary prose has to
   avoid looking like Gherkin, and front matter is not part of it.
4. **EARS statements** ("When <trigger>, the <system> shall <response>"). Excellent for crisp
   requirement sentences and NFRs, but not executable and no example data.
5. **TypeScript DSL / code-first specs.** Typed and refactorable, but excludes non-developers,
   cannot hold an idea-level spec gracefully, and couples specs to one language.
6. **YAML/JSON requirement records.** Easy to query, poor to write prose in, and still need a
   separate behaviour notation to be executable.
7. **Formal specifications** (TLA+, Alloy, Quint). Precise for protocols and concurrency, far too
   heavy as the default and unreadable for most stakeholders.
8. **Markdown + YAML front matter + fenced ```` ```gherkin ```` blocks.** Prose and structure where
   each is natural: front matter for id, kind, maturity and links; free Markdown for problem
   statements, EARS sentences, tables, diagrams and rationale; standard Gherkin, parsed by the
   official Cucumber parser, for behaviour.

## Decision

We use option 8. The format is **CommonMark with YAML front matter, fenced Gherkin and
`[[wiki-links]]` in prose**: a spec is any such file whose front matter has an `id`. The front
matter is JSON data written as YAML; the body is read by a CommonMark parser, so what a renderer
shows as code or as an HTML comment is never read as a scenario or a link. All gherkin blocks in
a file form one Feature, compiled to pickles by `@cucumber/gherkin` and bound to step definitions
with Cucumber Expressions. Classic `.feature` files are accepted too (metadata in `@key:value`
tags), so existing suites join the graph without conversion. Nothing stops a team from writing
EARS sentences or formal models *inside* a spec; option 8 is a container, not a straitjacket.

## Consequences

- Maturity is visible in the content itself: no Gherkin yet means not specified yet.
- What sdp reads is what any Markdown viewer shows: an example of a scenario inside a ```` ```text ````
  block stays an example, and the edge cases of fences, indentation and line endings are
  CommonMark's, not sdp's ([[ARCH-spec-parser]]).
- Quality requirements use the same format as quality attribute scenarios (source/environment →
  *Given*, stimulus → *When*, response and measure → *Then*).
- Decisions, architecture rules and milestone gates can carry executable scenarios too, through
  built-in steps that query the graph.
- Gherkin's weak spots stay: step text is untyped prose, and step definitions can sprawl. We
  mitigate with typed Cucumber Expressions and snippet suggestions for undefined steps.

~~~gherkin
Scenario: All Gherkin in this repository parses
  Then there are no diagnostics for rule "gherkin-syntax"
~~~
