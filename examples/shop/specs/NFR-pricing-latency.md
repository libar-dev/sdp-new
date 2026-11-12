---
id: NFR-pricing-latency
title: Pricing stays fast for large carts
maturity: ready
type: quality
quality: performance
---

# Pricing stays fast for large carts

B2B customers order hundreds of lines; recalculating the total on every change must feel instant.

```gherkin
@serial
Scenario: Large cart total
  Given a cart with 1000 distinct lines
  When the total is calculated 100 times
  Then each calculation takes under 2 ms on average
```
