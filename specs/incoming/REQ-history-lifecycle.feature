@id=REQ-history-lifecycle @maturity=draft
Feature: Lifecycle from git history

  The discipline chart of `sdp lifecycle` shows the plan: which discipline's work on each spec is
  planned into which iteration. When people stop moving work between iterations, the chart turns
  back into a drawing. Git history knows what actually happened: which specs, decisions and code
  changed during each iteration's dates.

  Rule: Each iteration shows the activity its dates saw in git next to the activity planned into it

  Rule: An iteration whose planned work saw no change stands out
