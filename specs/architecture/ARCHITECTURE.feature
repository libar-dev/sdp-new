@id=ARCHITECTURE @kind=view
Feature: Architecture overview

  The rules that hold between all elements.

  Rule: A uses link between elements is exactly a value import between the modules anchored to them

    `A uses B` says one thing: a module anchored to `A` imports a function, a class or a constant
    from a module anchored to `B`. An import of types alone calls no code of the other element.

    Scenario: The uses links of this repository
      Then the "uses" links between elements are the value imports between the modules anchored to them

  Rule: No element depends on itself through others

    Scenario: The elements of this repository
      Then no element reaches itself over "uses" links

  Rule: Nothing depends on a transport, except the command line that starts the server

    Scenario: The command line and the MCP server
      Then the query "#ARCH-cli <-uses- *" returns no results
      And the query "#ARCH-mcp <-uses- *" returns:
        | ARCH-cli |

  @open
  Rule: Does `src/app/` — the use cases, the answer envelope, the templates — get an element of its own?

  @open
  Rule: Which element is `src/model/Results.ts`, the results a run records as data?
