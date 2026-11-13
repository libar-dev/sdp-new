@id=specs-are-filed-by-what-they-are-for @kind=guide
Feature: Each spec of this repository is in the folder of what it is for

  Where a reader of this repository finds a spec. A folder is navigation: sdp reads no meaning into
  one, so what a folder says holds only where a scenario here keeps it true.

  Rule: A feature is in specs/features, and declares a maturity only while it is still to come

    Rule by rule: a change to a live feature is rules of it with a maturity of their own, so a live
    feature stays where it is while a change to it is built.

    @replaces:GUIDE#where-each-spec-of-this-repository-is
    Scenario: Where each spec of this repository is
      When I run "ls specs" in the repository
      Then the output lines are "ARCHITECTURE.feature, VISION.feature, decisions, features, guide, plan, steps"
      And the query "feature[file!~^specs/features/]" returns no results

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: A feature is in the folder of its area, and in that area's backlog while it is wholly still to come

    An area is what users of sdp do with it: adopt, specify, verify, architect, deliver, explore. The
    backlog repeats the maturity of a Feature line, so the folder and the tag are kept in step here; a
    rule still to come in a live feature leaves the feature where it is.

    Scenario: Where features are
      Then the query "feature[file!~^specs/features/[^/]+/]" returns no results
      And the query "*[file~^specs/features/][kind!=feature|rule|scenario|epic]" returns no results
      And the query "*[file~^specs/features/[^/]+/[^/]+/][file!~^specs/features/[^/]+/backlog/]" returns no results
      And the query "*[file~^specs/features/[^/]+/backlog/[^/]+/[^/]+/]" returns no results

    Scenario: The backlog holds what is wholly still to come, and nothing else
      Then the query "feature[maturity][file!~/backlog/]" returns no results
      And the query "feature[!maturity][file~/backlog/]" returns no results

  @decided-by:areas-for-reading-epics-for-work
  Rule: An epic is in a backlog folder named for it, beside the features it groups, or in specs/plan when its work spans areas

    Scenario: Where epics are
      Then the query "epic[file!~^specs/(plan|features)/]" returns no results
      And the query "epic[file~^specs/features/][file!~^specs/features/[^/]+/backlog/([^/]+)/\1\.feature$]" returns no results
      And the query "feature[file~^specs/features/[^/]+/backlog/[^/]+/] !<-includes- epic" returns no results

  Rule: Architecture is a decision, a rule of a spec, or what sdp shows from the code's annotations

    A rule this repository's code keeps is in specs/ARCHITECTURE.feature. An element is the code
    anchored to it, and that code's doc comment says what it is for, so no prose about it can stop
    being true.

    Scenario: No spec declares an element
      Then the query "element" returns at least 1 result
      And there are no diagnostics for rule "declared-in-spec"

  Rule: A decision is in specs/decisions, and only what no feature's rule can hold is one

    A decision is hard to reverse, surprising without context and a real trade-off, and it spans
    features. A reason that concerns one feature is written under the rule it explains. A decision
    that changes is rewritten or deleted: its history is git's.

    Scenario: The decisions of this repository
      Then the query "decision[file!~^specs/decisions/]" returns no results
      And the query "*[file~^specs/decisions/][kind!=decision]" returns no results
