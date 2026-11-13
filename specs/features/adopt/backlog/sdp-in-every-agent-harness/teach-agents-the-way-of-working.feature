@id=teach-agents-the-way-of-working @maturity=ready
Feature: Teach agents the way of working

  An agent in a repository specified with sdp asks the graph before it greps, writes the rule and its
  example before the code, leaves open what nobody decided, and never edits what sdp derives. The
  plugin's one skill teaches that; what only writing a spec needs is read when a spec is written.

  Not a skill per job: skills that overlap are slower to learn than one, and the earlier
  implementation's five grew to 782 Markdown files. Not a second statement of sdp's rules: where the
  skill and `sdp check` differ, check is right and the skill is wrong.

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

    It is read whole in every session, by every agent: what most work does not need costs each of
    them.

    Scenario: The size of the skill
      When I run "sh -c 'test $(wc -c < skills/sdp/SKILL.md) -le 10000'" in the repository
      Then the exit code is 0

  Rule: Every sdp command the skill and its references show runs as written in a workspace sdp init started, and exits as they say

    A command that no longer runs teaches the agent a step that fails, and nothing else would notice.

    Scenario: The commands of the skill, run
      Given the workspace is a copy of "examples/shop"
      When every sdp command shown in "skills/sdp" is run in the workspace
      Then each exited 0, or as the text beside it says

  @maturity=idea
  Rule: Agents taught by the skill leave open what a request left open: a choice the requester did not make is a rule tagged @open, not a rule they chose

    In the earlier implementation's trials every cold author settled a choice the requester had left
    open, with valid syntax and an honest maturity: a check of the format cannot see it.
