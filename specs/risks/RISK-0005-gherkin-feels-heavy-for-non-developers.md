---
id: RISK-0005
links:
  price-of: DEC-0001
  affects: REQ-progressive-specs
  mitigated-by: REQ-web-explorer
  due: MS-IOC
---

# Gherkin feels heavy for non-developers

Product owners, analysts and stakeholders may find front matter, fenced blocks and
Given/When/Then alien, and leave the specs to developers. The specs then describe the
implementation rather than the need, and the people who own the need stop reading them.

**Watch for:** scenarios written only by developers, and ideas that never reach `draft`.
