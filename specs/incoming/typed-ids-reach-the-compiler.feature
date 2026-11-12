@id=typed-ids-reach-the-compiler @kind=change @maturity=draft
@changes:link-code-to-specs
Feature: Typed ids reach the compiler

  `sdp types` writes `.sdp/ids.d.ts` so that the compiler rejects an id no spec declares, but only
  a compile that includes the file sees it. A tsconfig that names no `include`, or that includes
  the folder `.sdp`, leaves it out, and every id then compiles without a word from sdp.

  When it is built, its rule joins the rule on `sdp types` in link-code-to-specs.

  Rule: sdp types and sdp check say when the TypeScript configuration does not include the declarations they wrote
