@id=start-from-the-state @maturity=draft
@depends-on:ask-the-graph @realized-by:ARCH-reports
@iteration:IT-agent-plugin
Feature: Start from the state of the repository

  An agent that starts on a repository, and a person who reviews one, need first what the files do
  not say at a glance: the words in use, the significant parts and how they relate, the rules that
  hold and those still to come, and where each is written. `sdp graph` prints that state.

  Not the specs or the code again: a record says where they are written.

  Rule: The state opens with its vocabulary: each kind, relation and fact in use, what it means, and whether sdp makes, interprets or carries it

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

  Rule: Work still to come is in the state as built work is, at every maturity, and each record of work says which it is

    Scenario: An idea, work that is ready, and a rule still to come in a built feature
      Given these specs:
        | tags                         | Feature  |
        | @id=wishlist @maturity=idea  | Wishlist |
        | @id=checkout @maturity=ready | Checkout |
      And a file "specs/cart.feature" containing:
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
        | wishlist                         | feature  | idea     | true   |
        | checkout                         | feature  | ready    | true   |
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

  Rule: The architect writes once what an element is for, on the anchor marked primary, `@sdp is ARCH-x primary=true`, and check reports an element marked primary twice

    The comments of its other anchors describe their own code, and which file sorts first is no
    choice.

  Rule: The state the hook gives stays within 2,000 characters, and a larger one is fetched when asked for, within a budget of its own, naming what it left out; neither is sized by the specs and code it is read from

    An agent must read it whole before its first step, and a deep dive into one node is `sdp
    context <id>`. The larger budget is set once it is measured.
