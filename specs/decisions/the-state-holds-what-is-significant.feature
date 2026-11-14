@id=the-state-holds-what-is-significant @kind=decision
Feature: The state holds what the architect calls significant, and the architecture is projected from it

  The state is a curated graph: each spec by its id with the lines of its rules and examples, the
  decisions, the elements and patterns an architect declared, the code anchored to them, and the
  links between. It exists so that a reader understands the system being built, and can make
  architectural decisions and design against it.

  **Rejected:** harvesting every abstraction a parser can find, which other tools already do and
  which buries what matters; an architecture spec of rules the code is checked against, which
  compiles the architecture instead of thinking it.

  Rule: Significance is declared by architecting, never computed

    It takes the architect's thought, and no procedure or formula decides it. What an architect
    declares or anchors is, by that act, significant: sdp never ranks, limits or suggests it, and an
    agent proposes it.

  Rule: The architecture is a projection of the decisions, the specs and the code anchored to them

    `sdp arch` shows it, and no spec of its own describes it.

  Rule: An element is described once, by what it is for

    Its primary anchor's doc comment states its responsibility in a few lines. How its code works
    is no part of the state.

  Rule: The state knows only what was declared

    Code nobody anchored, and the text under a line, are read where they are written.
