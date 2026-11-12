---
id: EXAMPLE-shop
kind: guide
title: Example — a shop
---

# Example — a shop

A small product specified with sdp the way a team would: domain code in `src/`, specifications
at every maturity, a decision and the one architecture element in `specs/`, and step definitions
that drive the domain code.

| File | Shows |
| --- | --- |
| [specs/REQ-cart-totals.md](specs/REQ-cart-totals.md) | a ready requirement whose scenarios pass: *verified* |
| [specs/REQ-guest-checkout.md](specs/REQ-guest-checkout.md) | specified, not built: its steps are *undefined*, not failing, and what is still undecided is an open question |
| [specs/REQ-wishlist.md](specs/REQ-wishlist.md) | an idea — a title and a sentence are a valid spec |
| [specs/NFR-pricing-latency.md](specs/NFR-pricing-latency.md) | a quality requirement whose step definitions are a fitness function |
| [specs/ARCH-pricing.md](specs/ARCH-pricing.md) | the element an architect declared, and why it matters |
| [specs/DEC-0001-money-is-integer-cents.md](specs/DEC-0001-money-is-integer-cents.md) | a decision: what was chosen over what, and why |
| [specs/steps/cart.steps.ts](specs/steps/cart.steps.ts) | step definitions, importing `defineSteps` from `sdp/steps` |
| [src/pricing.ts](src/pricing.ts), [src/cart.ts](src/cart.ts) | code linked to the graph with typed `annotate()` calls from `sdp/annotations` |
| [.sdp/ids.d.ts](.sdp/ids.d.ts) | the ids those calls accept, written by `sdp types`, so a mistyped id fails `tsc` |

From the repository root:

```sh
node src/cli/main.ts -C examples/shop run         # 3 scenarios pass, guest checkout is undefined
node src/cli/main.ts -C examples/shop arch        # ARCH-pricing with its decision and quality requirement
node src/cli/main.ts -C examples/shop context REQ-guest-checkout
node src/cli/main.ts -C examples/shop types       # after adding or renaming a spec
```

Annotations are ordinary code, not comments. `annotate(import.meta, { is: "ARCH-pricing" })` says
which code the element is: that is the architecture. `annotate(vatFor, { implements:
"REQ-cart-totals" })` is this shop's own relation from code to a requirement — any relation can be
annotated, and whether a team wants that link is its call. In languages other than TypeScript and
JavaScript, an `@sdp is ARCH-pricing` comment does the same.

The root [README](../../README.md) runs this suite, and shows this architecture, in a copy of the
example with every build.
