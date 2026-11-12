@id=REQ-history-lifecycle @maturity=draft
@refines:CAP-living-specs
@iteration:C2 @activity.analysis-design:C3 @activity.implementation:C4 @activity.test:C4 @activity.test:T1
Feature: Lifecycle from git history

  The discipline chart of `sdp lifecycle` shows the plan: which discipline's work on each spec is
  planned into which iteration. When people stop moving work between iterations, the chart turns
  back into a drawing. Git history knows what actually happened: which specs, decisions and code
  changed during each iteration's dates.

  Rule: Each iteration shows the activity its dates saw in git next to the activity planned into it

  Rule: An iteration whose planned work saw no change stands out

  @open
  Rule: May sdp read git for this, when nothing else it does reads git?

  @open
  Rule: Does a change to a spec count for its discipline in the iteration of the commit, whatever its iteration and activity tags say?

  @open
  Rule: Which discipline does a change to code count for?

  @open
  Rule: How much history to read by default, and how to keep it fast on long-lived repositories?
