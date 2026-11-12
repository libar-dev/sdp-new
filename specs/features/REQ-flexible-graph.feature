@id=REQ-flexible-graph @maturity=ready
@realized-by:ARCH-graph @realized-by:ARCH-graph-builder @realized-by:ARCH-code-annotations @realized-by:ARCH-vocabulary @decided-by:files-are-the-source-of-truth
Feature: A free-form system graph

  The full state of the system — specs, rules, scenarios, decisions, architecture, plan, code
  links — is one graph, so teams model what matters to them and agents can follow any edge.

  @decided-by:free-vocabulary
  Rule: Kinds, relations and attributes are whatever the authors write

    Scenario: A bounded context that publishes to an event bus
      Given these specs:
        | tags                                                                                    | Feature           |
        | @id=ARCH-orders @kind=bounded-context @publishes-to:ARCH-event-bus @guarded-by:DEC-0001 | Orders            |
        | @id=ARCH-event-bus @kind=element                                                        | Event bus         |
        | @id=DEC-0001                                                                            | Events over calls |
      When the workspace is loaded
      Then node "ARCH-orders" has attribute kind = "bounded-context"
      And the workspace graph has edges:
        | from        | rel          | to             |
        | ARCH-orders | publishes-to | ARCH-event-bus |
        | ARCH-orders | guarded-by   | DEC-0001       |

    Scenario: constructor, toString and __proto__ are words like any other
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [constructor, toString] }
        """
      And these specs:
        | tags                                                                                            | Feature |
        | @id=REQ-a @kind=constructor @maturity=toString @owner.__proto__.valueOf=1 @hasOwnProperty:REQ-a | A       |
      When the workspace is checked
      Then sdp reports nothing
      And sdp status counts the stages "toString:1"
      When I query "constructor[maturity>constructor]"
      Then the result is "REQ-a"
      When I query "*[owner.__proto__.valueOf=1, hasOwnProperty=REQ-a]"
      Then the result is "REQ-a"
      When I query "*[toString]"
      Then the result is "nothing"
      When the graph is exported
      Then the output contains '"owner":{"__proto__":{"valueOf":1}}'
      And the output contains '"rel":"hasOwnProperty","to":"REQ-a"'
      When I run "sdp new constructor 'Odd one'"
      Then the exit code is 0

  Rule: Only a tag links: one tag per target, an edge at its line and an attribute of the node that writes it

    Scenario Outline: One target, two, and a dotted relation
      Given these specs:
        | tags                   | Feature |
        | @id=I1 @kind=iteration | I1      |
        | @id=I2 @kind=iteration | I2      |
        | @id=REQ-a <links>      | A       |
      When I query "*[<rel>=I1]"
      Then the result is "REQ-a"
      And the workspace graph has edges:
        | from  | rel   | to | source                |
        | REQ-a | <rel> | I1 | specs/REQ-a.feature:1 |

      Examples:
        | links                       | rel                     |
        | @iteration:I1               | iteration               |
        | @iteration:I2 @iteration:I1 | iteration               |
        | @activity.implementation:I1 | activity.implementation |

    Scenario: An id in a description is text
      Given these specs:
        | tags            | Feature       |
        | @id=ARCH-orders | Orders        |
        | @id=DEC-0001    | Refund policy |
      And a file "specs/REQ-refunds.feature" containing:
        """
        @id=REQ-refunds @realized-by:ARCH-orders
        Feature: Refunds

          Follows the policy of DEC-0001.
        """
      When the workspace is loaded
      Then the edges from "REQ-refunds" are "REQ-refunds -realized-by-> ARCH-orders"
