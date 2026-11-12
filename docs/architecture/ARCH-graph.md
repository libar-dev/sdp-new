---
id: ARCH-graph
kind: element
title: System graph
significant: true
rationale: >-
  Every command, check, gate and agent reads it; its free-form shape (DEC-0002) is the product's
  main modifiability bet, and changing it touches every feature.
iteration: E1
links:
  decided-by: [DEC-0002, DEC-0003]
  instance-of: { to: PAT-derived-index, role: index }
  constrained-by: NFR-query-performance
---

# System graph

Nodes (`id`, `kind`, `title`, attributes, source) and edges (`from`, `rel`, `to`, attributes,
source), with in/out adjacency indexes. Immutable once built. Knows nothing about requirements,
decisions or architecture — those are conventions on top.

Code: `src/model/Graph.ts`.
