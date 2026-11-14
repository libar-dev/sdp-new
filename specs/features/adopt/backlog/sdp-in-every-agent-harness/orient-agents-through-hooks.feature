@id=orient-agents-through-hooks @maturity=ready
@iteration:IT-agent-plugin
Feature: Orient agents through hooks

  An agent that starts a session does not know where the project stands, and does not think to ask:
  the plugin's hook tells it, in a few lines, before its first step.

  Not instructions: the hook shows what sdp answers, never what an agent should do.

  Background:
    Given a file "shop/sdp.config.yaml" containing:
      """
      # every key at its default
      """
    And a file "shop/specs/plan/IT-beta.feature" containing:
      """
      @id=IT-beta @start=2099-01-05 @end=2099-01-16
      Feature: Beta 1
      """
    And a file "shop/specs/plan/MS-beta.feature" containing:
      """
      @id=MS-beta @closes:IT-beta
      Feature: Beta
      """
    And a file "shop/specs/features/cart.feature" containing:
      """
      @id=cart @maturity=draft @iteration:IT-beta
      Feature: Cart

        @open
        Rule: Does a cart expire?
      """

  Rule: At session start, the agent is shown what sdp lifecycle --brief prints where the session started

    Scenario: A session started below the workspace's root
      When the plugin's hook runs at session start in "shop/src"
      Then the output contains "MS-beta"
      And the output line with "cart" contains "draft"
      And the output contains "Does a cart expire?"
      When I run "sdp lifecycle --brief" in "shop/src"
      Then the output is what the hook showed

  @quality
  Rule: The orientation arrives within 5 seconds, or one line says it did not and names the command to run

    @serial
    Scenario: A workspace of 500 specs, all planned now
      Given 500 features in "shop" planned into "IT-beta", each with an open question
      When the plugin's hook runs at session start in "shop"
      Then the output contains "MS-beta"
      And the hook answered within 5000 ms

  Rule: Outside an sdp workspace the hook shows nothing

    Scenario: A directory with no sdp.config
      When the plugin's hook runs at session start in "elsewhere"
      Then the exit code is 0
      And the output is empty

  Rule: A hook that fails says so in one line, and lets the session go on

    Scenario: A workspace whose specs cannot be read whole
      Given a file "shop/specs/features/broken.feature" containing:
        """
        @id=broken @owner=Two words
        Feature: Broken
        """
      When the plugin's hook runs at session start in "shop"
      Then the exit code is 0
      And the output has 1 line
      And the output contains "sdp check"

  Rule: On an event that recurs, a prompt or a tool call, the hook orients a session once, the first time

    Scenario: Two tool calls of one session, then a new session
      When the plugin's hook runs on "PreToolUse" for session "a" in "shop"
      Then the output contains "MS-beta"
      When the plugin's hook runs on "PreToolUse" for session "a" in "shop"
      Then the output is empty
      When the plugin's hook runs on "PreToolUse" for session "b" in "shop"
      Then the output contains "MS-beta"

  Rule: The hook runs the sdp the workspace installed, and names both versions when the plugin's differs

    A plugin installed for a person serves every repository, each with sdp at a version of its own.

    Scenario: A plugin newer than the workspace's sdp
      Given the workspace "shop" installed sdp "0.1.0"
      And the plugin is of sdp "0.2.0"
      When the plugin's hook runs at session start in "shop"
      Then the output contains "MS-beta"
      And the output line with "0.2.0" contains "0.1.0"

  Rule: Where the workspace installed no sdp, the hook runs the plugin's own and says so

    Never npx, a download or an sdp on the PATH: `sdp` on npm is another package, and one on the PATH
    may be of any version.

  @maturity=idea
  Rule: An agent that edits a spec is shown the diagnostics of that file before its next step
