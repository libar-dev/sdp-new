@id=list-the-open-questions @maturity=specified
@realized-by:ARCH-application @realized-by:ARCH-reports
Feature: List the open questions

  The owner of a project needs to see what waits on them — every call still open, where it is asked,
  and what work it holds up — grouped the way they navigate: by spec, by epic, by iteration or by
  folder. `sdp q 'rule[tags=@open]'` answers with a flat list of rules; this answers with the
  questions in their groups, and narrows to the part of the project at hand.

  Not a tracker: a question is a rule tagged `@open` in the spec it concerns, and is answered there.

  Background:
    Given a file "specs/features/shop/cart.feature" containing:
      """
      @id=cart @maturity=draft @iteration:IT-beta
      Feature: Cart

        Rule: A cart holds what was added

        @open
        Rule: Does a cart expire?

        @open @maturity=idea
        Rule: Can a cart be shared with a friend?
      """
    And a file "specs/features/saving/wishlist.feature" containing:
      """
      @id=wishlist @maturity=idea
      Feature: Wishlist

        @open
        Rule: Is a wishlist public?
      """
    And a file "specs/plan/IT-beta.feature" containing:
      """
      @id=IT-beta @start=2026-12-01 @end=2026-12-12
      Feature: Beta
      """
    And a file "specs/plan/saving.feature" containing:
      """
      @id=saving @kind=epic @includes:wishlist
      Feature: Saving for later
      """

  Rule: sdp questions lists every open question under the spec it is asked in, with its line and the maturity of the work it waits on

    A question in a live spec that declares no maturity is about what is built, and says so.

    Scenario: Every open question, by its spec
      When I run "sdp questions"
      Then the exit code is 0
      And the sections of the output are "cart  Cart, wishlist  Wishlist"
      And the output section "cart  Cart" contains "Does a cart expire?"
      And the output line with "Does a cart expire?" contains "draft"
      And the output line with "Can a cart be shared with a friend?" contains "idea"
      And the output section "wishlist  Wishlist" contains "Is a wishlist public?"
      And the output contains "3 open question(s) in 2 spec(s)"

  Rule: --by groups them by epic, iteration or directory instead, and a question no group holds comes last, under no group

    Scenario Outline: Grouped by <by>
      When I run "sdp questions --by <by>"
      Then the exit code is 0
      And the sections of the output are "<sections>"

      Examples:
        | by        | sections                                     |
        | epic      | saving  Saving for later, no epic            |
        | iteration | IT-beta  Beta, no iteration                  |
        | directory | specs/features/saving, specs/features/shop   |

  Rule: Targets narrow the questions as sdp run's do — a spec, an epic, an iteration or a directory — and -q to the nodes a query ends on

    Scenario Outline: Only the questions of <target>
      When I run "sdp questions <target>"
      Then the exit code is 0
      And the output contains "<in>"
      And the output does not contain "<out>"

      Examples:
        | target                      | in                    | out                   |
        | wishlist                    | Is a wishlist public? | Does a cart expire?   |
        | saving                      | Is a wishlist public? | Does a cart expire?   |
        | IT-beta                     | Does a cart expire?   | Is a wishlist public? |
        | specs/features/shop         | Does a cart expire?   | Is a wishlist public? |
        | -q 'feature[maturity=idea]' | Is a wishlist public? | Does a cart expire?   |

  Rule: With --json the groups and their questions are data, each question with its spec, file, line and maturity

    Scenario: The questions as data
      When I run "sdp questions --json"
      Then the exit code is 0
      And the JSON output has:
        | data.count              | 3                                                            |
        | data.groups.key         | cart, wishlist                                               |
        | data.groups.0.questions | cart#does-a-cart-expire, cart#can-a-cart-be-shared-with-a-friend |

  Rule: Where there is no open question, sdp questions says so in one line

    Scenario: Nothing waits
      When I run "sdp questions IT-beta --by epic -q 'feature[maturity=ready]'"
      Then the exit code is 0
      And the output lines are "0 open question(s)"
