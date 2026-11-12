---
id: ARCH-spec-parser
kind: element
title: Spec parser
significant: true
rationale: >-
  Defines the one specification format (DEC-0001). A change here changes what every spec file in
  every workspace means — the highest cost of change in the system.
iteration: E1
links:
  decided-by: DEC-0001
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  feeds: ARCH-graph
---

# Spec parser

Line-oriented Markdown scanning (front matter, headings, fences, `[[links]]`, open questions) and
Gherkin parsing through the official Cucumber parser, with every line mapped back to its file.

Code: `src/parse/`.
