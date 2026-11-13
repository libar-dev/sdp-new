@id=orient-agents-through-hooks @maturity=specified
Feature: Orient agents through hooks

  An agent that starts a session does not know where the project stands, and does not think to ask.
  The plugin's session-start hook tells it, in a few lines, before its first step.

  Not instructions: the way of working is the skill's and AGENTS.md's, which reach subagents and
  harnesses without hooks too.

  Rule: At session start the agent is told the milestone the project is at, the work planned now, and the open questions on that work

  @type=quality
  Rule: The orientation fits in 2,000 characters and arrives within 5 seconds, or one line says it did not

    Harnesses cut what a hook adds, Codex at about 2,500 tokens, and a slow hook holds up the session.

  Rule: Outside an sdp workspace the hook prints nothing, and a hook that fails says so in one line and lets the session go on

  Rule: The orientation is answered by the sdp the workspace installed, and says so when the plugin is of another version

  @maturity=idea
  Rule: An agent that edits a spec is shown the diagnostics of that file before its next step
