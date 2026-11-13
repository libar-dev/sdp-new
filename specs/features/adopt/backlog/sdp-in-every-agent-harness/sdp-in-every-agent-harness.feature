@id=sdp-in-every-agent-harness @kind=epic
@includes:install-the-agent-plugin @includes:teach-agents-the-way-of-working
@includes:orient-agents-through-hooks @includes:install-from-npm
@includes:plan-delivery#lifecycle-brief-prints-the-milestone-the-work-planned-now-and
Feature: sdp in every agent harness

  An agent in any supported harness learns the way of working from the package its repository
  installed, and starts each session knowing where the project stands. In this order: `lifecycle
  --brief`, the hook, the plugin and the change to `init`, the skill, then the gates, run by hand.
