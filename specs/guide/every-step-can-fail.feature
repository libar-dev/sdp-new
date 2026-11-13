@id=every-step-can-fail @kind=guide
Feature: Every step of this repository can fail

  A scenario is evidence only when its steps can fail: each step of this repository fails when what
  it checks is not there, each definition is used by an example and is the only one its steps match,
  and a step that is stopped ends what it started.

  Rule: An exit code other than 0, or an MCP tool's error, is stated before what was printed is read

    What a command or a tool printed after it failed is its error, so a step that looks for words in
    it, or for their absence, would pass whatever went wrong.

    Scenario: A command that failed
      Given the step definitions of this repository
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: The context of a cart names no wishlist

            Scenario: In a workspace without a cart
              When I run "sdp context cart"
              Then the output does not contain "wishlist"
        """
      When the workspace is run
      Then the step 'the output does not contain "wishlist"' has status "failed"
      And the step 'the output does not contain "wishlist"' reports "Then the exit code is 1"

    Scenario Outline: An MCP tool that reported an error, called <client>
      Given the step definitions of this repository
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: The context of a cart names no wishlist

            Scenario: In a workspace without a cart
              When <call> "sdp_context" with:
                ```
                { "id": "cart" }
                ```
              Then the output does not contain "wishlist"
        """
      When the workspace is run
      Then the step 'the output does not contain "wishlist"' has status "failed"
      And the step 'the output does not contain "wishlist"' reports "Then the MCP tool reports an error"

      Examples:
        | client       | call                             |
        | in memory    | an agent calls the MCP tool      |
        | as a process | an MCP client of "sdp mcp" calls |

  Rule: What a command did is asserted before the next step's output takes its place

    Once another step's output has taken its place, no step can look at it, and the command passes
    whatever it did.

    Scenario: Two commands, the first unasserted
      Given the step definitions of this repository
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart and a wishlist each have a context

            Scenario: In a workspace without either
              When I run "sdp context cart"
              And I run "sdp context wishlist"
              Then the exit code is 1
        """
      When the workspace is run
      Then the step 'I run "sdp context wishlist"' has status "failed"
      And the step 'I run "sdp context wishlist"' reports "nothing was asserted about `sdp context cart`"

  Rule: Every example of this repository ends on a step defined as a Then

    What checks a command is a step after it, so a command an example runs last passes whatever it
    did, written as a Then too. A step no definition matches yet is a Then as it is written.

    Scenario: The last step of every example, live or still to come
      When the steps of every example of this repository are matched with its step definitions
      Then the examples that do not end on a Then are:
        | example | step |

    Scenario: A command written as a Then
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: The context of a cart is shown

            Scenario: In a workspace without a cart
              Then I run "sdp context cart"
        """
      When the steps of every example of the workspace are matched with this repository's step definitions
      Then the examples that do not end on a Then are:
        | example                            | step                     |
        | cart#in-a-workspace-without-a-cart | I run "sdp context cart" |

  @open
  Rule: Does an example fail when no step after the last command it ran looked at what that command did?

    Ending on a Then is checked by keyword: `Then the query "feature" returns at least 1 result` after
    `When I run …` passes whatever the command did. A check when an example ends needs a hook the
    step API does not offer, or a reading of which definitions look at a command.

  Rule: A step that looks into a section of the output fails when the output has no such section

    A heading renamed, or never printed, would otherwise pass every step that says what is not in
    the section under it.

    Scenario: A section the output does not have
      Given the step definitions of this repository
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: The context of a cart names no wishlist

            Scenario: Under a heading it does not have
              Given these specs:
                | tags     | Feature |
                | @id=cart | Cart    |
              When I ask for the context of "cart"
              Then the output section "Nowhere" does not contain "wishlist"
        """
      When the workspace is run
      Then the step 'the output section "Nowhere" does not contain "wishlist"' has status "failed"
      And the step 'the output section "Nowhere" does not contain "wishlist"' reports 'no section "Nowhere"'

  Rule: A path into the JSON output that names no field fails, read through a list too

    Read through a list, a misspelt key named a field of none of its items and read as an empty
    list, which is what "nothing" expects.

    Scenario: A key no item of the list has
      Given the step definitions of this repository
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A program reads the features

            Scenario: By a key no feature has
              Given these specs:
                | tags     | Feature |
                | @id=cart | Cart    |
              When a program written with Effect asks the API for "feature" on files in memory
              Then the JSON output has:
                | data.nodes.idd | nothing |
        """
      When the workspace is run
      Then the step "the JSON output has:" has status "failed"
      And the step "the JSON output has:" reports "no field data.nodes.idd"

    Scenario: A list with no items
      Given the step definitions of this repository
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A program reads the elements

            Scenario: Of a workspace that has none
              Given these specs:
                | tags     | Feature |
                | @id=cart | Cart    |
              When a program written with Effect asks the API for "element" on files in memory
              Then the JSON output has:
                | data.nodes.id | nothing |
        """
      When the workspace is run
      Then the step "the JSON output has:" has status "passed"

  Rule: Every step definition of this repository is used by an example, and no step matches more than one

    A definition no example uses is code no scenario verifies. A step that matches two fails a run,
    but not in work still to come, whose run reports neither.

    Scenario: The step definitions and the steps of every example, live or still to come
      When the steps of every example of this repository are matched with its step definitions
      Then the step definitions of this repository that no example uses are:
        | definition | expression |
      And the steps that match more than one definition are:
        | step | definitions |

  Rule: The steps of work still to come that no definition matches are listed here

    Such a step fails no run, so one that loses its definition, or one that is new, would go unseen:
    listed here, each shows in review.

    Scenario: The steps still to be defined
      When the steps of every example of this repository are matched with its step definitions
      Then the steps that no definition matches are:
        | spec                            | step                                                                                                       |
        | install-the-agent-plugin        | "Claude Code" runs the plugin's hook on "SessionStart", as it finds it                                     |
        | install-the-agent-plugin        | "Claude Code" found 1 wiring of the hook                                                                   |
        | install-the-agent-plugin        | "Codex" runs the plugin's hook on "SessionStart", as it finds it                                           |
        | install-the-agent-plugin        | "Codex" found 1 wiring of the hook                                                                         |
        | install-the-agent-plugin        | "ZCode" runs the plugin's hook on "SessionStart", as it finds it                                           |
        | install-the-agent-plugin        | "ZCode" found 1 wiring of the hook                                                                         |
        | install-the-agent-plugin        | "Kimi Code" runs the plugin's hook on "UserPromptSubmit", as it finds it                                   |
        | install-the-agent-plugin        | "Kimi Code" found 1 wiring of the hook                                                                     |
        | install-the-agent-plugin        | "Grok Build" runs the plugin's hook on "PreToolUse", as it finds it                                        |
        | install-the-agent-plugin        | "Grok Build" found 1 wiring of the hook                                                                    |
        | install-the-agent-plugin        | "OpenCode" runs the plugin's hook on "context", as it finds it                                             |
        | install-the-agent-plugin        | "OpenCode" found 1 wiring of the hook                                                                      |
        | install-the-agent-plugin        | "Claude Code" at version "2.1.318", with the plugin installed in a workspace whose project is at "MS-beta" |
        | install-the-agent-plugin        | "Codex" at version "0.166.0", with the plugin installed in a workspace whose project is at "MS-beta"       |
        | install-the-agent-plugin        | "ZCode" at version "0.17.0", with the plugin installed in a workspace whose project is at "MS-beta"        |
        | install-the-agent-plugin        | "Kimi Code" at version "2.4.1", with the plugin installed in a workspace whose project is at "MS-beta"     |
        | install-the-agent-plugin        | "Grok Build" at version "1.0.70", with the plugin installed in a workspace whose project is at "MS-beta"   |
        | install-the-agent-plugin        | "OpenCode" at version "2.2.5", with the plugin installed in a workspace whose project is at "MS-beta"      |
        | install-the-agent-plugin        | a session starts there and its model is asked what it was given                                            |
        | install-the-agent-plugin        | the model's context held the skill "sdp"                                                                   |
        | install-the-agent-plugin        | the model's context held the orientation once, naming "MS-beta"                                            |
        | orient-agents-through-hooks     | the workspace "shop" installed sdp "0.1.0"                                                                 |
        | orient-agents-through-hooks     | the plugin is of sdp "0.2.0"                                                                               |
        | teach-agents-the-way-of-working | every sdp command shown in "skills/sdp" is run in the workspace                                            |
        | teach-agents-the-way-of-working | each exited 0, or as the text beside it says                                                               |

  Rule: A step that is stopped ends the processes it started, and theirs

    A step is stopped when it runs out of time or the run is interrupted. A process it leaves
    running keeps `sdp run` from exiting until the process ends, and one that waits for input, or
    ignores being told to end, never does.

    Scenario: Each step that starts a process, timed out while the process runs
      When each of these steps of this repository times out while the process it started runs:
        | step                                                                                              | doc                |
        | I run "<command>"                                                                                 |                    |
        | I run "<command>" in "sub"                                                                        |                    |
        | I run "<command>" in the repository                                                               |                    |
        | I run the pipeline:                                                                               | <command> \| cat   |
        | an MCP client of "<command>" calls "sdp_query" with:                                              | {}                 |
        | a program decodes every record of "<command>" in the repository with the package's record schema |                    |
        | a fresh Node process imports "<module>"                                                           |                    |
        | a program runs:                                                                                   | <program>          |
        | "<command>" runs 1 times after a run that warms it up                                             |                    |
        | the answer is what "<command>" prints                                                             |                    |
        | I run "sdp mcp -C <marker>" and interrupt it once "started.txt" exists                            |                    |
      Then each timed out and left no process running
