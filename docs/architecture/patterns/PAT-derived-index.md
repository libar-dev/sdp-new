---
id: PAT-derived-index
kind: pattern
title: Derived index over source files
iteration: I1
links:
  decided-by: DEC-0003
---

# Derived index over source files

Human-edited files are the only source of truth. Any structure needed to answer questions fast is
derived from them on demand and can be thrown away. What sdp writes is derived too and can be
deleted; scenario results, which the files alone cannot give back, are discarded as soon as what
they ran against changes ([[DEC-0011]]).

It is why grep, git and pull requests work on all delivery knowledge and why there is no database
to migrate; abandoning it would change every workflow.
