---
id: PAT-pipes-and-filters
kind: pattern
title: Pipes and filters
---

# Pipes and filters

Workspace IO → parse → build graph → analyse (query, check, run, lifecycle). Each stage after IO
is a pure function of its input, which is what lets executable specs run the real pipeline against
an in-memory file system.
