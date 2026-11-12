@id=VISION @kind=vision
@principle:DEC-0001 @principle:DEC-0002 @principle:DEC-0003 @principle:DEC-0005 @principle:DEC-0006 @principle:DEC-0007 @principle:DEC-0008
@iteration:I1
Feature: Vision

  sdp manages software delivery end to end. Requirements at every maturity, quality requirements,
  decisions, the curated architecture and the delivery lifecycle form one graph — written as plain
  files next to the code, checked by rules, and executable wherever behaviour can be verified.

  # TODO(convert): ## The problem

  # TODO(convert): Delivery knowledge is scattered. Ideas sit in a tracker, requirements in a wiki, acceptance tests
  # TODO(convert): in the code, decisions in meeting notes or nowhere, and the architecture in diagrams that stopped
  # TODO(convert): being true. Each place has its own status field that someone must remember to update, and none of
  # TODO(convert): them knows whether the system does what was asked. People struggle to see the whole; AI agents,
  # TODO(convert): which now do much of the work, cannot see it at all.

  # TODO(convert): ## Who it is for

  # TODO(convert): - **Product owners and analysts** capture an idea in one line and grow it into a specification
  # TODO(convert): without changing tools.
  # TODO(convert): - **Architects** name the few elements that shape the system, record why, and keep decisions next
  # TODO(convert): to what they affect.
  # TODO(convert): - **Developers and testers** get acceptance tests that are the specification, not a copy of it.
  # TODO(convert): - **Delivery leads** plan iterations and see milestones met or missed by evidence.
  # TODO(convert): - **AI agents** read, query and change all of it with grep, a CLI or MCP.

  # TODO(convert): ## Positioning

  # TODO(convert): sdp sits where requirements tools, BDD runners and architecture repositories overlap, and keeps
  # TODO(convert): what each does well in one graph. Unlike a requirements tool, it keeps specifications in the
  # TODO(convert): repository and runs them. Unlike a BDD runner, it also holds ideas, quality requirements,
  # TODO(convert): decisions, architecture and the plan. Unlike an architecture repository, it holds only what
  # TODO(convert): architects declared, connected to the decisions and evidence behind it.

  # TODO(convert): ## Principles and capabilities

  # TODO(convert): The principles are the decisions this vision links to, and three capabilities refine it:
  # TODO(convert): `sdp q '#VISION -principle-> decision'`, `sdp q 'capability -refines-> #VISION'`.

  Scenario: Every decision is one that something rests on
    Then the query "decision" returns at least 1 result
    And the query "decision !<-decided-by- *" returns no results
