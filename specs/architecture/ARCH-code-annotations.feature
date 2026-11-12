@id=ARCH-code-annotations
@instance-of:PAT-pipes-and-filters @uses:ARCH-vocabulary
Feature: Code annotations

  Links code into the graph. In TypeScript and JavaScript an annotation is code, a call to
  `annotate` from `sdp/annotations` that the compiler checks; in every language it may also be a
  comment. Both are read statically: sdp never runs the code.
