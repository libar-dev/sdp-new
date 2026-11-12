@id=VISION @kind=vision
@principle:specs-are-gherkin-files @principle:free-vocabulary @principle:files-are-the-source-of-truth
@principle:declared-maturity-derived-stage
Feature: Vision

  sdp manages software delivery end to end. Requirements at every maturity, quality requirements,
  decisions, the curated architecture and the delivery lifecycle form one graph, written as plain
  files next to the code, checked by rules and executable wherever behaviour can be verified.

  Today that knowledge is scattered over a tracker, a wiki, the code, meeting notes and diagrams
  that stopped being true, each with a status someone must remember to update and none knowing
  whether the system does what was asked. People struggle to see the whole; AI agents, which now
  do much of the work, cannot see it at all.

  It is for everyone who delivers: an analyst grows an idea into a specification without changing
  tools, an architect names the few elements that shape the system and records why, developers and
  testers get acceptance tests that are the specification, a delivery lead sees milestones met by
  evidence, and an agent reads, queries and changes all of it with grep, a CLI or MCP.

  Unlike a requirements tool, sdp keeps specifications in the repository and runs them; unlike a
  BDD runner, it also holds ideas, quality requirements, decisions, architecture and the plan;
  unlike an architecture repository, it holds only what architects declared, with the decisions
  and evidence behind it.

  Rule: Every decision is one that something rests on

    A choice nothing rests on is a sentence where it applies, not a record.

    Scenario: The decisions of this repository
      Then the query "decision" returns at least 1 result
      And the query "decision !<-decided-by- *" returns no results
