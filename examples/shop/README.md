# Example — a shop

A small product specified with sdp the way a team would: domain code in `src/`, its features at
every maturity and a decision in `specs/`, the one architecture element declared by its code, and
step definitions that drive the domain code.

| File | Shows |
| --- | --- |
| [specs/features/cart-totals.feature](specs/features/cart-totals.feature) | a live feature — built, so it declares no maturity — whose scenarios pass: *verified*. Its quality rule's step definitions are a fitness function |
| [specs/features/guest-checkout.feature](specs/features/guest-checkout.feature) | a feature specified and still to come: its steps are *undefined*, which fails no run, and what is still undecided is an open question |
| [specs/features/wishlist.feature](specs/features/wishlist.feature) | an idea — a title and a sentence are a valid spec |
| [specs/decisions/integer-cents.feature](specs/decisions/integer-cents.feature) | a decision: what was chosen over what, why, and at what price; the rule it imposes is a rule of cart totals |
| [specs/steps/cart.steps.ts](specs/steps/cart.steps.ts) | step definitions, importing `defineSteps` from `sdp/steps` |
| [src/pricing.ts](src/pricing.ts) | the element `ARCH-pricing`, declared where its code is by a tag in the comment that opens the file; the rest of that comment says what it is for |
| [src/cart.ts](src/cart.ts) | code outside the architecture: nothing anchors it |

From the repository root:

```sh
node src/cli/main.ts -C examples/shop run         # 3 scenarios pass, guest checkout is undefined
node src/cli/main.ts -C examples/shop arch        # ARCH-pricing, described by its code, and integer-cents through cart totals
node src/cli/main.ts -C examples/shop context guest-checkout
```

The tag `@sdp is ARCH-pricing` in the comment that opens `src/pricing.ts` says which code the
element is: that is the architecture, and sdp derives which element imports which from it. In the
doc comment of a declaration, the same tag says that declaration is the element, in any language.
Code links to the architecture, not to features: cart totals names the element that realizes it
with `@realized-by:ARCH-pricing`.

[GUIDE.feature](../../specs/GUIDE.feature) runs this suite, and shows this architecture, in a copy
of the example with every build of sdp.
