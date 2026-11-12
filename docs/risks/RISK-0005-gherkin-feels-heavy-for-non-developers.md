---
id: RISK-0005
kind: risk
title: Gherkin feels heavy for non-developers
status: open
exposure: medium
links:
  affects: REQ-progressive-specs
  mitigated-by: REQ-web-explorer
  due: MS-IOC
---

# Gherkin feels heavy for non-developers

Product owners, analysts and stakeholders may find front matter, fenced blocks and
Given/When/Then alien, and leave the specs to developers. The specs then describe the
implementation rather than the need, and the people who own the need stop reading them.

An idea or a draft needs no Gherkin: a title and a paragraph are a valid spec
([[REQ-progressive-specs]]). Readers who do not live in a terminal still have nowhere to browse
the result ([[REQ-web-explorer]]).

**Watch for:** scenarios written only by developers, and ideas that never reach `draft`.
