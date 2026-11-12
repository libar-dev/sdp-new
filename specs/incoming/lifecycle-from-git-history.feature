@id=lifecycle-from-git-history @kind=change @maturity=draft
@changes:plan-delivery
Feature: Lifecycle from git history

  Whoever leads a team's delivery wants `sdp lifecycle` to show what was done, not only what was
  planned. Its discipline chart shows the plan: which discipline's work on each spec is planned
  into which iteration. When people stop moving work between iterations, the chart turns back into
  a drawing. Git history knows what actually happened: which specs, decisions and code changed
  during each iteration's dates.

  When it is built, its rules join those of plan-delivery on the chart.

  Rule: Each iteration shows the activity its dates saw in git next to the activity planned into it

  Rule: An iteration whose planned work saw no change stands out
