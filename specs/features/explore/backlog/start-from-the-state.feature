@id=start-from-the-state @maturity=draft
@depends-on:ask-the-graph @realized-by:ARCH-reports
@iteration:IT-agent-plugin
Feature: Start from the state of the repository

  An agent that starts on a repository, and a person who reviews one, need first what the files do
  not say at a glance: the words in use, the significant parts and how they relate, the rules that
  hold and those still to come. `sdp graph` prints that state.

  Not the specs or the code again: a record says where they are written.

  Rule: The state opens with the vocabulary in use: each word, what it means, and how sdp treats it

    Scenario: The words of a small workspace
      Given these specs:
        | tags                                        | Feature |
        | @id=cart @maturity=ready @depends-on:prices | Cart    |
        | @id=prices @maturity=idea                   | Prices  |
      When I run "sdp graph"
      Then the exit code is 0
      And the records of type "word" include at least:
        | word       | of       | sdp        | used |
        | feature    | kind     | interprets | 2    |
        | depends-on | relation | carries    | 1    |
        | maturity   | fact     | interprets | 2    |

  Rule: Every record of work says whether it is still to come, built work too

    Scenario: A built feature with a rule still to come
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds each item once

            Scenario: Adding an item twice
              When I add "a lamp" twice

          @maturity=draft
          Rule: A cart expires after a day
        """
      When I run "sdp graph"
      Then the exit code is 0
      And the records of type "node" are:
        | id                               | kind     | maturity | toCome |
        | cart                             | feature  |          | false  |
        | cart#a-cart-holds-each-item-once | rule     |          | false  |
        | cart#a-cart-expires-after-a-day  | rule     | draft    | true   |
        | cart#adding-an-item-twice        | scenario |          |        |

  Rule: An element and a pattern carry what they are for, in the words of the doc comment that declares them

    Scenario: An element declared in a doc comment
      Given a file "src/orders.ts" containing:
        """
        /**
         * Owns the order aggregate and its transaction boundary.
         *
         * @sdp is ARCH-orders
         */
        export class Orders {}
        """
      When I run "sdp graph"
      Then the exit code is 0
      And the records of type "node" are:
        | id                        | kind    | doc                                                    |
        | ARCH-orders               | element | Owns the order aggregate and its transaction boundary. |
        | code:src/orders.ts#Orders | code    | Owns the order aggregate and its transaction boundary. |

  Rule: What an element is for is written once, on the anchor marked primary

    The comments of its other anchors describe their own code, and which file sorts first is no
    choice. An anchor is marked `@sdp is ARCH-x primary=true`, and an element marked primary twice
    is reported.

  Rule: Asked for more than the hook shows, sdp gives the state within a budget, naming what it left out

    The budget does not grow with the specs and code the state is read from: an agent reads it whole
    before its first step, and a deep dive into one node is `sdp context <id>`. The budget is set
    once it is measured.

  @open
  Rule: Does the hook show the state, or what sdp lifecycle --brief prints, and whose is the 2,000-character budget?

    orient-agents-through-hooks shows the brief, whose own rule holds the budget; the rules above speak of
    the state the hook gives.
