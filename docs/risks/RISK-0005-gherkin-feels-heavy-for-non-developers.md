---
id: RISK-0005
kind: risk
title: Gherkin feels heavy for non-developers
status: open
exposure: medium
links:
  affects: REQ-progressive-specs
  mitigated-by: REQ-web-explorer
---

# Gherkin feels heavy for non-developers

Product owners, analysts and stakeholders may find front matter, fenced blocks and
Given/When/Then alien, and leave the specs to developers. The specs then describe the
implementation rather than the need, and the people who own the need stop reading them.

## Mitigation

- Ideas and drafts need no Gherkin: a title and a paragraph are a valid spec
  ([[REQ-progressive-specs]]).
- The body is ordinary Markdown: prose, tables, diagrams and EARS sentences are first-class
  ([[DEC-0001]]).
- A browsable explorer would serve readers who do not live in a terminal ([[REQ-web-explorer]]).

**Watch for:** scenarios written only by developers, and ideas that never reach `draft`.
