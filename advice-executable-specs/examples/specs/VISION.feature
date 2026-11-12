@id=VISION @kind=vision
@iteration:I1
Feature: Vision

  sdp manages software delivery end to end. Requirements at every maturity, quality requirements,
  decisions, the curated architecture and the delivery lifecycle form one graph: written as plain
  files next to the code, checked by rules, and executable wherever behaviour can be verified.

  The problem. Delivery knowledge is scattered. Ideas sit in a tracker, requirements in a wiki,
  acceptance tests in the code, decisions in meeting notes or nowhere, and the architecture in
  diagrams that stopped being true. Each place has its own status field that someone must remember
  to update, and none of them knows whether the system does what was asked. People struggle to see
  the whole; AI agents, which now do much of the work, cannot see it at all.

  Who it is for. Product owners and analysts capture an idea in one line and grow it into a
  specification without changing tools. Architects name the few elements that shape the system and
  record why. Developers and testers get acceptance tests that are the specification, not a copy of
  it. Delivery leads see milestones met or missed by evidence. AI agents read, query and change all
  of it with grep, a CLI or MCP.

  Positioning. Unlike a requirements tool, sdp keeps specifications in the repository and runs
  them. Unlike a BDD runner, it also holds ideas, quality requirements, decisions, architecture and
  the plan. Unlike an architecture repository, it holds only what architects declared, connected to
  the decisions and evidence behind it.

  Rule: The vision is broken down into capabilities, and every requirement refines one

    Scenario: No capability and no requirement stands alone
      Then the query "vision" returns 1 result
      And the query "capability" returns at least 1 result
      And the query "capability !-refines-> vision" returns no results
      And the query "capability !<-refines- requirement|nfr" returns no results
      And the query "requirement|nfr !-refines-> capability" returns no results
