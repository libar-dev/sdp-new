@id=ARCHITECTURE @kind=view
Feature: Architecture overview

  The rules that hold between all elements. `sdp arch` prints the architecture and
  `sdp arch --mermaid` draws it; how data flows through it is PAT-pipes-and-filters.

  `A uses B` says one thing: a module anchored to `A` imports a value — a function, a class, a
  constant — from a module anchored to `B`. An import of types alone is no use: it calls no code of
  the other element.

  Scenario: The uses links declared between elements are exactly the value imports between the modules anchored to them
    Then the "uses" links between elements are the value imports between the modules anchored to them

  Scenario: No element depends on itself through others, so no cycle between elements goes unrecorded
    Then no element reaches itself over "uses" links

  Scenario: Nothing depends on a transport, except the command line that starts the server
    Then the query "#ARCH-cli <-uses- *" returns no results
    And the query "#ARCH-mcp <-uses- *" returns:
      | ARCH-cli |

  Scenario: The pipeline reads a workspace in memory as it reads one on disk
    Given a file "notes/NOTE-outside.md" containing:
      """
      ---
      id: NOTE-outside
      ---
      # Outside the workspace
      """
    And a file "shop/specs/REQ-cart.md" containing:
      """
      ---
      id: REQ-cart
      ---
      # Cart
      """
    When the workspace "shop" is loaded from memory and from disk
    Then both graphs have exactly the nodes "REQ-cart"

  @open
  Rule: Does `src/app/` — the use cases, the answer envelope, the templates — get an element of its own? Until the architects say, its modules are anchored to ARCH-reports.

  @open
  Rule: `src/model/Results.ts`, the results a run records as data, is anchored to no element.
