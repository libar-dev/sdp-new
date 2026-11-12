---
id: REQ-guest-checkout
title: Guest checkout
maturity: specified
links:
  refines: REQ-cart-totals
  decided-by: DEC-0002
---

# Guest checkout

Shoppers without an account can pay. Specified, not built: its steps have no definitions yet, so
`sdp run` reports it as *undefined* (not automated), not as failing.

## Open questions

- [ ] Do we verify the email address before payment?

```gherkin
Scenario: Guest pays by card
  Given a cart with 2 items at 1000 cents
  When a guest checks out with a valid card
  Then an order is created
  And a receipt is emailed
```
