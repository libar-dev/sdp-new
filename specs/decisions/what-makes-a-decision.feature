@id=what-makes-a-decision @kind=decision
Feature: A decision records a choice that is hard to reverse, not obvious without its reason, and a real trade-off

  A decision is static: it records *that* a choice was made and *why*, and holds until another
  decision replaces it. A choice that fails one of the three tests is written under the rule it
  explains, or nowhere.

  **Rejected:** a decision for every reason given, which buries the few that matter; a decision
  that orders work or runs checks, which is a plan or a spec.

  Rule: It is hard to reverse

    Changing our mind later costs real work: a migration, a rewrite, or what users already rely on.

  Rule: It is not obvious without its reason

    A reader of the specs or the code finds it surprising, counter-intuitive or hard to understand,
    and would ask why it was made.

  Rule: It is a real trade-off

    There were genuine alternatives, and one was chosen for reasons that can be stated.

  Rule: It is static

    Its rules state what holds; none has an example to run. What it requires of the product is a
    rule of the spec it constrains, tagged `@decided-by:` with the decision.

  Rule: These kinds of choice usually qualify

    - **Architectural shape:** files are the source of truth, and every command rebuilds the graph.
    - **Technology that carries lock-in:** Effect 4 for IO, errors and services.
    - **Boundary and scope:** the graph holds what the architect calls significant, and no more.
    - **Deliberate deviation from the obvious path:** a checkout runs its TypeScript with no build step.
    - **A constraint the code cannot show:** the package is published under a scope, as `sdp` on npm is taken.
    - **A rejected alternative whose rejection is not obvious:** Markdown with Gherkin in fences.
