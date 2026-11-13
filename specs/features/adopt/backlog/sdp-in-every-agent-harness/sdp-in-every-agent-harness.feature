@id=sdp-in-every-agent-harness @kind=epic
@includes:install-the-agent-plugin @includes:teach-agents-the-way-of-working
@includes:orient-agents-through-hooks @includes:install-from-npm
@includes:plan-delivery#lifecycle-brief-prints-the-milestone-the-work-planned-now-and
Feature: sdp in every agent harness

  An agent in any supported harness learns the way of working from the package its repository
  installed, and starts each session knowing where the project stands.

  Built in this order: `lifecycle --brief`, the hook, the plugin's files and shims with the change
  to `init`, the skill, then the gates, run by hand. The wiring is carried over from the earlier
  implementation, libar-dev/software-delivery-protocol at commit
  0224fb743d781aa12ff5230697279bc975f1d87f, with its package name, version and paths made this
  package's: `plugin.json`, `hooks/hooks.json`, `.zcode-plugin/plugin.json`, `kimi.plugin.json` and
  `opencode/server.js`; `hooks/session-start.mjs` with `claimSession`, which shows a prompt's or a
  tool call's orientation once per session even to copies that overlap, and without `claimEvent`,
  whose lock, claim file and clock told a second wiring's copy of session start apart; the settings
  its README gives for Kimi Code and Grok Build, as what `init` prints; and of its tests, in
  `test/session-start-hook.test.ts` the hook's output, the once-per-session claim, each harness's
  wiring run as that harness resolves it and the OpenCode module, and in `test/skills.test.ts` the
  shape of the plugin. Its `.claude/settings.json` and `.codex/hooks.json` were the second wiring,
  and stay behind.
