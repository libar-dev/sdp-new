@id=orient-agents-through-hooks @maturity=ready
Feature: Orient agents through hooks

  An agent that starts a session does not know where the project stands, and does not think to ask.
  The plugin's hook tells it, in a few lines, before its first step.

  Not instructions: the way of working is the skill's and AGENTS.md's, which reach subagents and
  harnesses without hooks too. The hook shows what sdp answers, never what an agent should do.

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

        Rule: A cart holds what was added

        @open
        Rule: Does a cart expire?
      """

  Rule: At session start the agent is shown what sdp lifecycle --brief prints for the workspace sdp finds from where the session started

    The hook carries the brief and adds nothing to it, so a person who runs the command sees what the
    agent was shown. The earlier implementation read the workspace from where sdp was installed, and
    a session in one package of a monorepo was told about another.

    Scenario: A session started below the workspace's root
      When the plugin's hook runs at session start in "shop/src"
      Then the output contains "MS-beta"
      And the output line with "cart" contains "draft"
      And the output contains "Does a cart expire?"
      When I run "sdp lifecycle --brief" in "shop/src"
      Then the output is what the hook showed

  @quality
  Rule: The orientation fits in 2,000 characters and arrives within 5 seconds, or one line says it did not and names the command to run

    Harnesses cut what a hook adds — Codex at about 2,500 tokens, Claude Code at 10,000 characters —
    and a slow hook holds up the first reply. The earlier hook showed 20,000 characters.

    Scenario: A workspace of 500 specs
      Given a generated workspace of 500 specs
      When the plugin's hook runs at session start in the workspace
      Then the output is at most 2000 characters
      And the hook answered within 5000 ms

  Rule: Outside an sdp workspace the hook shows nothing; a hook that fails says so in one line and lets the session go on

    A plugin installed for a person runs in every repository they open, most of them without sdp.

    Scenario: A directory with no sdp.config
      When the plugin's hook runs at session start in "elsewhere"
      Then the exit code is 0
      And the output is empty

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

  Rule: Run on an event that recurs — a prompt, a tool call — the hook shows the orientation once per session, the first time

    That is how Kimi Code and Grok Build are wired, and a second copy of the orientation costs every
    later turn its context.

    Scenario: Two tool calls of one session, then a new session
      When the plugin's hook runs on "PreToolUse" for session "a" in "shop"
      Then the output contains "MS-beta"
      When the plugin's hook runs on "PreToolUse" for session "a" in "shop"
      Then the output is empty
      When the plugin's hook runs on "PreToolUse" for session "b" in "shop"
      Then the output contains "MS-beta"

  Rule: The orientation is answered by the sdp the workspace installed, and says so when the plugin is of another version

    A plugin installed for a person serves every repository, each with sdp at a version of its own;
    the plugin's own sdp would read the specs by rules the repository does not keep.

    Scenario: A plugin newer than the workspace's sdp
      Given the workspace "shop" installed sdp "0.1.0"
      And the plugin is of sdp "0.2.0"
      When the plugin's hook runs at session start in "shop"
      Then the output contains "MS-beta"
      And the output line with "0.2.0" contains "0.1.0"

  @maturity=idea
  Rule: An agent that edits a spec is shown the diagnostics of that file before its next step
