# Example — a shop

A small product specified with sdp the way a team would: domain code in `src/`, its features at
every maturity and a decision in `specs/`, the one architecture element declared by its code, and
step definitions that drive the domain code.

| File | Shows |
| --- | --- |
| [specs/features/cart-totals.feature](specs/features/cart-totals.feature) | a built feature whose scenarios pass: *verified*. Its quality rule's step definitions are a fitness function |
| [specs/incoming/guest-checkout.feature](specs/incoming/guest-checkout.feature) | a feature specified, not built: its steps are *undefined*, not failing, and what is still undecided is an open question |
| [specs/incoming/wishlist.feature](specs/incoming/wishlist.feature) | an idea — a title and a sentence are a valid spec |
| [specs/decisions/integer-cents.feature](specs/decisions/integer-cents.feature) | a decision: what was chosen over what, and why; the rule it imposes is a rule of cart totals |
| [specs/steps/cart.steps.ts](specs/steps/cart.steps.ts) | step definitions, importing `defineSteps` from `sdp/steps` |
| [src/pricing.ts](src/pricing.ts) | the element `ARCH-pricing`, declared where its code is with a typed `annotate()` call from `sdp/annotations`; its doc comment says what it is for |
| [src/cart.ts](src/cart.ts) | code outside the architecture: nothing anchors it |
| [.sdp/ids.d.ts](.sdp/ids.d.ts) | the ids those calls accept, written by `sdp types`, so a mistyped id fails `tsc` |

From the repository root:

```sh
node src/cli/main.ts -C examples/shop run         # 3 scenarios pass, guest checkout is undefined
node src/cli/main.ts -C examples/shop arch        # ARCH-pricing, described by its code, and integer-cents through cart totals
node src/cli/main.ts -C examples/shop context guest-checkout
node src/cli/main.ts -C examples/shop types       # after adding or renaming a spec
```

Annotations are ordinary code, not comments. `annotate(import.meta, { is: "ARCH-pricing" })` says
which code the element is: that is the architecture, and sdp derives which element imports which
from it. Code links to the architecture, not to features: cart totals names the element that
realizes it with `@realized-by:ARCH-pricing`. In languages other than TypeScript and JavaScript,
an `@sdp is ARCH-pricing` comment does the same.

[GUIDE.feature](../../specs/GUIDE.feature) runs this suite, and shows this architecture, in a copy
of the example with every build of sdp.
