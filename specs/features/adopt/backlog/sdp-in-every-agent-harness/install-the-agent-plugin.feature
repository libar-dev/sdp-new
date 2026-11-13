@id=install-the-agent-plugin @maturity=ready
@iteration:IT-agent-plugin
Feature: Install the agent plugin

  Teams run their agents in several harnesses — Claude Code, Codex, Kimi Code, Grok Build, ZCode
  and OpenCode — and every agent must learn the same way of working, of the sdp version the
  repository installed. A skill that `sdp init` copies into `.claude/skills` reaches Claude Code alone and is
  stale at the next upgrade. The package is the plugin instead, laid out as the Agent Plugins
  standard says: installed once, it gives each supported harness the skill and the session hook of
  the version installed.

  Not an agent, and not the MCP server, which `serve-agents` specifies. sdp writes no harness's
  settings: where a harness needs a step in a person's own settings, sdp names it.

  Rule: One package is the plugin of every supported harness: one manifest, one folder of skills and one hook script

    A copy per harness would drift from the others and from the sdp installed beside it.

    Scenario: The plugin is the package
      When I run "npm pack --dry-run --json" in the repository
      Then the exit code is 0
      And the output contains "plugin.json"
      And the output contains "skills/sdp/SKILL.md"
      And the output contains "hooks/session-start.mjs"
      And the output contains "opencode/server.js"
      And "plugin.json" in the repository conforms to the Agent Plugins 1.0.0 schema

  Rule: Where the standard does not reach a harness, a shim of that harness's own names the plugin and where its skills are, and holds no skill text

    The standard keeps hooks out of its portable core, and some harnesses find a plugin only through
    a manifest of their own. A shim that held text would be one more copy to keep in step.

    Scenario Outline: The shim of <harness>
      When I run "cat <shim>" in the repository
      Then the exit code is 0
      And the JSON output has exactly the fields "<fields>"

      Examples:
        | harness   | shim                      | fields                             |
        | ZCode     | .zcode-plugin/plugin.json | name, version, description         |
        | Kimi Code | kimi.plugin.json          | name, version, description, skills |

  Rule: Each supported harness finds one wiring of the hook in the plugin, or in the one setting sdp names, and run as that harness runs it, it orients the session

    The earlier implementation's hook was wired twice, by the plugin and by the repository's own
    settings, and telling the second run from the next event took a lock, a claim and a clock. Kimi Code and Grok Build show a session-start hook's output to the person only, so
    theirs runs on the first prompt and on the first tool call. OpenCode runs no command hooks, so a
    plugin module of the package runs the one script and adds its text to the session's context.

    Background:
      Given these specs:
        | tags                                          | Feature |
        | @id=MS-beta                                   | Beta    |
        | @id=IT-beta @start=2099-01-05 @end=2099-01-16 | Beta 1  |
        | @id=cart @maturity=draft @iteration:IT-beta   | Cart    |

    Scenario Outline: <harness>, from <wiring>
      When "<harness>" runs the plugin's hook on "<event>", as it finds it
      Then "<harness>" found 1 wiring of the hook
      And the output contains "MS-beta"
      And the output contains "cart"

      Examples:
        | harness     | wiring                                    | event            |
        | Claude Code | hooks/hooks.json                          | SessionStart     |
        | Codex       | the com.openai extension of plugin.json   | SessionStart     |
        | ZCode       | hooks/hooks.json                          | SessionStart     |
        | Kimi Code   | the setting sdp init names                | UserPromptSubmit |
        | Grok Build  | the setting sdp init names                | PreToolUse       |
        | OpenCode    | the setting sdp init names                | context          |

  @replaces:start-a-spec#init-starts-a-workspace-where-it-is-run-with-a-configuration
  Rule: init starts a workspace with a configuration that shows every default and overwrites nothing, writes no skill, and names how each supported harness installs the plugin

    A copy of the skill in the repository is one version behind as soon as sdp is upgraded.

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

    Files in the right place prove nothing about what a model reads, and harnesses change it from
    one version to the next. It is checked where the harness is installed, so it is a gate.

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
