@id=PAT-pipes-and-filters
@decided-by:effect-for-io
Feature: Pipes and filters

  Workspace IO → parse → build graph → analyse (query, check, run, lifecycle).

  Rule: Only workspace IO touches files, and each stage after it is a pure function of its input

    That is what lets executable specs run the real pipeline against an in-memory file system.

    Scenario: The core does no IO
      When I run "grep -rlE FileSystem|node:fs src/parse src/model src/graph src/check" in the repository
      Then the exit code is 1

    Scenario: A workspace in memory reads as one on disk
      Given a file "notes/NOTE-outside.feature" containing:
        """
        @id=NOTE-outside
        Feature: Outside the workspace
        """
      And a file "shop/specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart
        Feature: Cart
        """
      When the workspace "shop" is loaded from memory and from disk
      Then both graphs have exactly the nodes "REQ-cart"
