@id=install-the-agent-plugin @maturity=specified
Feature: Install the agent plugin

  Teams run their agents in more than one harness, and each agent must learn the same way of
  working. A skill that `sdp init` copies into `.claude/skills` reaches Claude Code alone and goes
  stale with every upgrade of sdp. The package itself is the plugin: installed once, it gives every
  supported harness the skill and the hooks of the version that is installed.

  Not an agent, and not the MCP server, which `serve-agents` specifies.

  Rule: The package is the plugin of every supported harness, and a file of one harness's own only wires it, holding no skill text

  Rule: Claude Code and Codex are supported first, each installed with one command that sdp init names

  @replaces:start-a-spec#init-starts-a-workspace-where-it-is-run-with-a-configuration
  Rule: init writes no skill, and says how to install the plugin

    A copy of the skill in the repository is one version behind as soon as sdp is upgraded.

  @gate
  Rule: The model of each supported harness receives the skill and the orientation, at a named version of the harness

    Hooks are outside the Agent Plugins standard, and files in the right place prove nothing about what
    a model reads: this is checked where the harness is installed, not in every run.

  @maturity=idea
  Rule: OpenCode, Kimi Code, Grok Build and ZCode are supported
