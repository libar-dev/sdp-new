---
id: ARCH-vocabulary
kind: element
title: Vocabulary profile
links:
  decided-by: DEC-0002
  configured-by: REQ-configuration
---

# Vocabulary profile

The few words sdp reads meaning into, each as a role with a default word that a workspace can
rename ([[REQ-configuration]]), and the words sdp makes itself, which are fixed. Every other
module asks the profile what a role is called, so renaming a word changes what sdp reads instead
of silently switching a feature off. `sdp vocabulary` prints it.
