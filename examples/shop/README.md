---
id: EXAMPLE-shop
kind: guide
title: Example — a shop
---

# Example — a shop

A small product specified with sdp the way a team would: domain code in `src/`, specifications
at every maturity in `specs/`, decisions and the one architecture element in `docs/`,
and step definitions that drive the domain code.

| File | Shows |
| --- | --- |
| [specs/REQ-cart-totals.md](specs/REQ-cart-totals.md) | a ready requirement whose scenarios pass: *verified* |
| [specs/REQ-guest-checkout.md](specs/REQ-guest-checkout.md) | specified, not built: its steps are *undefined*, not failing |
| [specs/REQ-wishlist.md](specs/REQ-wishlist.md) | an idea — a title and a sentence are a valid spec |
| [specs/NFR-pricing-latency.md](specs/NFR-pricing-latency.md) | a quality requirement whose step definitions are a fitness function |
| [docs/ARCH-pricing.md](docs/ARCH-pricing.md) | the element an architect declared, and why it matters |
| [docs/DEC-0001-prices-in-cents.md](docs/DEC-0001-prices-in-cents.md) | an accepted architecture decision |
| [docs/DEC-0002-free-shipping.md](docs/DEC-0002-free-shipping.md) | a proposed product decision |
| [specs/steps/cart.steps.ts](specs/steps/cart.steps.ts) | step definitions, importing `defineSteps` from `sdp/steps` |
| [src/pricing.ts](src/pricing.ts), [src/cart.ts](src/cart.ts) | code linked to the graph with typed `annotate()` calls from `sdp/annotations`: `is` anchors ARCH-pricing, `implements` names the requirement |
| [.sdp/ids.d.ts](.sdp/ids.d.ts) | the ids those calls accept, written by `sdp types`, so a mistyped id fails `tsc` |

From the repository root:

```sh
node src/cli/main.ts -C examples/shop run         # 3 scenarios pass, guest checkout is undefined
node src/cli/main.ts -C examples/shop arch        # ARCH-pricing with its decision and quality requirement
node src/cli/main.ts -C examples/shop context REQ-guest-checkout
node src/cli/main.ts -C examples/shop types       # after adding or renaming a spec
```

Annotations are ordinary code, not comments: `annotate(vatFor, { implements: "REQ-cart-totals" })`
puts `vatFor` in the graph as a `code` node linked to the requirement. In languages other than
TypeScript and JavaScript, an `@sdp implements REQ-cart-totals` comment does the same.

The root [README](../../README.md) runs this suite in a copy of the example with every build.
