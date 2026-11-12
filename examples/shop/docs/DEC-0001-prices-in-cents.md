---
id: DEC-0001
title: Represent money as integer cents
status: accepted
category: architecture
date: 2026-10-01
links:
  affects: [ARCH-pricing]
---

# Represent money as integer cents

## Context
Floating point sums drift (0.1 + 0.2). Prices, VAT and totals must reconcile with accounting.

## Decision
All amounts are integers in cents; rounding happens once, when VAT is computed.

## Consequences
Formatting for display is a separate concern; currencies without cents need a scale per currency later.
