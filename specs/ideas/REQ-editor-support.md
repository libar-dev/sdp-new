---
id: REQ-editor-support
kind: requirement
title: Editor support
maturity: draft
links:
  refines: CAP-living-specs
---

# Editor support

Authors want completion for ids and relation names in front matter, go-to-definition on `[[ID]]`
links and `@sdp` comments, and inline diagnostics from `sdp check` — through a language server, so
every editor benefits. Completing relation names from those already in use also keeps the free-form
vocabulary from drifting.

## Open questions

- [ ] Which relation names to suggest when the vocabulary is free-form — the ones already used in the workspace?
