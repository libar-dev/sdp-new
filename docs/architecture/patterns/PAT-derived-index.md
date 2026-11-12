---
id: PAT-derived-index
kind: pattern
title: Derived index over source files
iteration: I1
links:
  decided-by: DEC-0003
---

# Derived index over source files

Human-edited files are the only source of truth. Any structure needed for fast questions is
derived from them on demand and can be thrown away. Persisted state is limited to what cannot be
derived (scenario results), and is invalidated by content hashes.

It is why grep, git and pull requests work on all delivery knowledge and why there is no database to
migrate; abandoning it would change every workflow.
