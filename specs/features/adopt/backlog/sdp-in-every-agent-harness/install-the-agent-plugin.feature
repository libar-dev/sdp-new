@id=install-the-agent-plugin @maturity=ready
@iteration:IT-agent-plugin
Feature: Install the agent plugin

  Teams run agents in several harnesses, and each must learn the way of working of the sdp version
  the repository installed: the package is the plugin of each, as the Agent Plugins standard lays
  it out, with the skill and the session hook of that version.

  Not the MCP server, which `serve-agents` specifies, and no harness's settings are written.

  Rule: One package is the plugin of every supported harness: one manifest, one folder of skills and one hook script

    Scenario: The plugin is the package
      When I run "npm pack --dry-run --json" in the repository
      Then the exit code is 0
      And the output contains "plugin.json"
      And the output contains "skills/sdp/SKILL.md"
      And "plugin.json" in the repository conforms to the Agent Plugins 1.0.0 schema

  Rule: Where the standard does not reach a harness, a shim of that harness's own names the plugin and where its skills are, and holds no skill text

    Scenario Outline: The shim of <harness>
      When I run "cat <shim>" in the repository
      Then the exit code is 0
      And the JSON output has:
        | name | sdp |
      And the output does not contain "Rule:"

      Examples:
        | harness   | shim                      |
        | ZCode     | .zcode-plugin/plugin.json |
        | Kimi Code | kimi.plugin.json          |

  Rule: Each supported harness finds one wiring of the hook in the plugin, or in the one setting sdp names, and run as that harness runs it, it orients the session

    Background:
      Given these specs:
        | tags                                          | Feature |
        | @id=MS-beta                                   | Beta    |
        | @id=IT-beta @start=2099-01-05 @end=2099-01-16 | Beta 1  |
        | @id=cart @maturity=draft @iteration:IT-beta   | Cart    |

    Scenario Outline: <harness>, on <event>
      When "<harness>" runs the plugin's hook on "<event>", as it finds it
      Then "<harness>" found 1 wiring of the hook
      And the output contains "MS-beta"
      And the output contains "cart"

      Examples:
        | harness     | event            |
        | Claude Code | SessionStart     |
        | Codex       | SessionStart     |
        | ZCode       | SessionStart     |
        | Kimi Code   | UserPromptSubmit |
        | Grok Build  | PreToolUse       |
        | OpenCode    | context          |

  Rule: init starts a workspace with a configuration that shows every default and overwrites nothing, writes no skill, and names how each supported harness installs the plugin

    Scenario: Run twice, below another workspace
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp init" in "shop"
      Then the exit code is 0
      And the output contains "created sdp.config.yaml"
      And the output contains "Claude Code"
      And the output contains "Codex"
      And the output contains "Kimi Code"
      And the output contains "Grok Build"
      And the output contains "ZCode"
      And the output contains "OpenCode"
      And the file "shop/sdp.config.yaml" contains "# features: "
      And the file "shop/.claude/skills/sdp/SKILL.md" does not exist
      When I run "sdp init" in "shop"
      Then the output contains "exists  sdp.config.yaml"
      When I run "sdp check --base none" in "shop"
      Then the exit code is 0

  Rule: A harness is supported only where its model, at a version of the harness the example names, received the skill and the orientation, the orientation once

    @gate
    Scenario Outline: <harness> <version>
      Given "<harness>" at version "<version>", with the plugin installed in a workspace whose project is at "MS-beta"
      When a session starts there and its model is asked what it was given
      Then the model's context held the skill "sdp"
      And the model's context held the orientation once, naming "MS-beta"

      Examples:
        | harness     | version |
        | Claude Code | 2.1.318 |
        | Codex       | 0.166.0 |
        | ZCode       | 0.17.0  |
        | Kimi Code   | 2.4.1   |
        | Grok Build  | 1.0.70  |
        | OpenCode    | 2.2.5   |
