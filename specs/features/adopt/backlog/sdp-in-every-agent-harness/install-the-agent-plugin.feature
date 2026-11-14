@id=install-the-agent-plugin @maturity=ready
@iteration:IT-agent-plugin @depends-on:orient-agents-through-hooks
Feature: Install the agent plugin

  Teams run agents in several harnesses, and each must learn the way of working of the sdp version
  the repository installed: the package is the plugin of each, as the Agent Plugins standard lays
  it out, with the skill and the session hook of that version.

  Not the MCP server, which `serve-agents` specifies, and no harness's settings are written.

  Rule: The package is the plugin of every supported harness, as the Agent Plugins standard lays it out

    Scenario: The plugin is the package
      Given the package npm packs from a checkout of this repository, installed in the workspace as "sdp"
      When I run "ls node_modules/sdp/plugin.json node_modules/sdp/skills/sdp/SKILL.md"
      Then the exit code is 0
      And "plugin.json" in the repository conforms to the Agent Plugins 1.0.0 schema

  Rule: A harness the standard does not reach finds the plugin through a shim of its own, which holds no skill text

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

  Rule: Each supported harness finds the hook wired once, and run as that harness runs it, it orients the session

    Wired in the plugin, or in the one setting of the harness that sdp names. The harnesses are not
    installed where these examples run, so they say only that the plugin is wired as each harness
    expects; that a harness supports it, only the gate says.

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

  Rule: init writes no skill, and names how each supported harness installs the plugin instead

    The skill comes with the plugin, at the version the repository installed.

    Scenario: A new workspace
      When I run "sdp init"
      Then the exit code is 0
      And the file ".claude/skills/sdp/SKILL.md" does not exist
      And the output contains "Claude Code"
      And the output contains "Codex"
      And the output contains "ZCode"
      And the output contains "Kimi Code"
      And the output contains "Grok Build"
      And the output contains "OpenCode"

  Rule: A harness is supported only where its model, at the version the gate pins, received the skill and one orientation

    A harness answers through a model, at a cost per session. Where what a model was given cannot be
    read yet, support stays unverified.

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
