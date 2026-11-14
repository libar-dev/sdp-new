@id=sdp-in-every-agent-harness @kind=epic
@includes:install-the-agent-plugin @includes:teach-agents-the-way-of-working
@includes:orient-agents-through-hooks @includes:install-from-npm
@includes:plan-delivery#lifecycle-brief-prints-the-milestone-the-work-planned-now-and
Feature: sdp in every agent harness

  An agent in any supported harness learns the way of working from the sdp its repository
  installed, and starts each session knowing where the project stands.

  `lifecycle --brief` is built first, since the hook shows what it prints. The files and tests to
  carry over are those of the earlier implementation, commit 0224fb7 of the repository
  software-delivery-protocol.
