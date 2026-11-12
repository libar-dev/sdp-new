---
id: ARCH-vocabulary
kind: element
title: Vocabulary profile
links:
  decided-by: DEC-0002
  configured-by: REQ-configuration
---

# Vocabulary profile

The few words sdp reads meaning into — kinds such as `decision` and `milestone`, relations such as
`supersedes` and the plan relation, attributes such as `activity`, the decision statuses, the
maturity ladder and the disciplines — each as a role with a default word that a workspace can
rename under `vocabulary:` ([[REQ-configuration]]). Every other module asks the profile what a role
is called, so renaming a word changes what sdp reads instead of silently switching a feature off
([[DEC-0002]]). Lookups keyed by authors' words see only own properties: `constructor` is a legal
kind. The profile is validated when the configuration is read — every role has a word, and no two
roles contradict each other; `sdp vocabulary` prints it.

The words sdp makes itself are fixed and listed in the profile too, and printed with it: the
`scenario`, `code` and `missing` kinds, the derived attributes (`derived-attribute`,
[[ARCH-graph-builder]]), the stages beyond maturity, and the names no link can have because sdp
reads them as attributes ([[DEC-0010]]).

Code: `src/model/Vocabulary.ts`.
