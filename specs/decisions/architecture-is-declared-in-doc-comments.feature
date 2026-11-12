@id=architecture-is-declared-in-doc-comments @kind=decision
Feature: Code declares the architecture in its doc comments

  Not a typed call such as `annotate(Thing, { is: "ARCH-x" })`, which runs as code and sits beside
  the comment that already says what the code is for: a tag in that doc comment, `@sdp is ARCH-x` or
  `@sdp plays PAT-y`, declares an element or a pattern in one grammar for every language, and the
  rest of the comment describes it. The price is that an id no node declares is caught by `sdp
  check`, not by the compiler.
