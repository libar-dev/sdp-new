@id=list-the-open-questions @maturity=idea
@realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-cli
Feature: List the open questions

  The owner of a project needs to see what waits on them — every call still open, where it is asked,
  and what work it holds up — grouped the way they navigate, and narrowed to the part of the project
  at hand. `sdp q 'rule[tags=@open]'` answers with a flat list of rules.

  Not a tracker: a question is a rule tagged `@open` in the spec it concerns, and is answered there.

  Rule: sdp questions lists every open question under the spec it is asked in, with its line and the maturity of the work it waits on

    A question in a live spec that declares no maturity is about what is built, and says so.

  Rule: --by groups them by epic, iteration or directory instead, and a question no group holds comes last, under no group

  Rule: Targets narrow the questions as sdp run's do — a spec, an epic, an iteration or a directory — and -q to the nodes a query ends on

  Rule: With --json the groups and their questions are data, each question with its spec, file, line and maturity

  Rule: Where there is no open question, sdp questions says so in one line
