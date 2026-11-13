@id=teach-agents-the-way-of-working @maturity=ready
@iteration:IT-agent-plugin @depends-on:install-the-agent-plugin
Feature: Teach agents the way of working

  An agent in a repository specified with sdp asks the graph before it greps, writes the rule and its
  example before the code, leaves open what nobody decided, and never edits what sdp derives: the
  plugin's one skill teaches it that.

  Not a second statement of sdp's rules: where the skill and `sdp check` differ, check is right.

  Rule: The plugin has one skill, and it teaches the whole way of working: orient, find the spec that owns a behaviour, change the rule and its example, write the steps, check and run, plan

    Scenario: The skills the plugin ships
      When I run "ls skills" in the repository
      Then the exit code is 0
      And the output lines are "sdp"

  Rule: What only writing a spec needs — the sharp edges of the format, replacing what is live — is a reference the skill names, read on demand

    Scenario: Every reference is named where the skill is read
      Then every file under "skills/sdp/references" in the repository is named in "skills/sdp/SKILL.md"

  @quality
  Rule: The skill an agent loads first fits in 10,000 characters

    Scenario: The size of the skill
      When I run "cat skills/sdp/SKILL.md" in the repository
      Then the exit code is 0
      And the output is at most 10000 characters

  Rule: Every sdp command the skill and its references show runs as written in a workspace sdp init started, and exits as they say

    Scenario: The commands of the skill, run
      Given the workspace is a copy of "examples/shop"
      When every sdp command shown in "skills/sdp" is run in the workspace
      Then each exited 0, or as the text beside it says

  Rule: A command the skill shows runs as written: it names ids and paths of examples/shop, a command shown failing is followed by the exit it ends with, `Exit: 1`, and what stands for a value is written in prose, never in a command

    `sdp context <id>` cannot run as it stands, and a command that fails on purpose reads as one
    that is broken.

  @maturity=idea
  Rule: Agents taught by the skill leave open what a request left open: a choice the requester did not make is a rule tagged @open, not a rule they chose
