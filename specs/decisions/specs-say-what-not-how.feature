@id=specs-say-what-not-how @kind=decision
Feature: A spec says what must hold and why, and leaves how to the implementation

  Not a design of the code: a spec is as concise as an implementer needs to succeed, names no
  implementation, and a technology only where its users see one. Where the architect calls an API
  shape significant, a stub outside the spec shows its conceptual design, in a folder the build does
  not compile; the rest is decided by the session that implements it, against the code. The price is
  that an implementer makes choices no spec made, judged in review against the rules and the stubs.
