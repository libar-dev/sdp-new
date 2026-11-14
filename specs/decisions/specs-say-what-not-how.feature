@id=specs-say-what-not-how @kind=decision
Feature: A spec defines what the product must do and why, concisely, and leaves how to the implementation

  Specs define the software product: what it does for a person, a program or an agent, and the
  qualities it keeps. Written before the code, a spec says what to build; once the code is built,
  the same Gherkin file documents it and tests it.

  **Rejected:** a design of the code in the spec, which the implementing session must follow or
  fight; specs of the repository that holds the product, which are its implementation detail.

  Rule: A spec holds what an implementation session needs to succeed, and no more

    It is written carefully, never verbosely. What a full understanding does not need is left to
    the session that implements it, decided there against the code.

  Rule: A spec defines what the product does for its users, or a quality it keeps

    How this repository is worked is no spec: it is a skill, a README, or nothing.

  Rule: A rule states one requirement, and its example fails when the rule is broken

  Rule: A spec names no implementation, and no technology its users do not see

    An example asks the product, through a command, a query or the API, never a search of the source.

  Rule: An API shape the architect calls significant is a stub beside the spec, never code in it

    A stub shows only the key design, in specs/stubs/<spec id>/, a folder the build does not
    compile, and goes once the real API is written.

  Rule: What the product does is written in a spec, not only in a comment

    A behaviour written only in a doc comment or in help text is a spec missing. A comment says
    why code is written as it is, where that is not obvious.

  Rule: An example is as small as its rule needs

    A table before a file written out whole, and a file only when the rule is about a file.

  Rule: A spec is none of these

    - a design of the code, or a test script whose setup outweighs its rule;
    - a rule of how this repository is worked, a writing style, or a tool's setting;
    - a list pinned so that any change fails it;
    - a reason, which is a decision's, or work to do, which is a plan's.
