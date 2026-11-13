@id=list-the-open-questions @maturity=idea
@realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-cli
Feature: List the open questions

  The owner of a project needs to see what waits on them, where each call is asked and what work it
  holds up, where `sdp q 'rule[tags=@open]'` answers with a flat list of rules.

  Not a tracker: a question is a rule tagged `@open` in the spec it concerns, and is answered there.

  Rule: sdp questions lists every open question under the spec it is asked in, with its line and the maturity of the work it waits on

  Rule: --by groups the questions by epic, iteration or directory instead, and targets narrow them as sdp run's do
