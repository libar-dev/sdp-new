@id=plan-as-a-sequence @kind=change @maturity=draft
@changes:plan-delivery
Feature: Plan as a sequence

  sdp plans the way the Rational Unified Process does: phases, six disciplines, activity tags and a
  chart of the disciplines. That shape came from the owner's example, not from a need of sdp's
  users, and this repository plans with two iterations and one milestone, using neither phases nor
  disciplines.

  @open
  Rule: Does sdp plan by a plain sequence of iterations and milestones by default, with phases and disciplines optional?

    A timeline needs no phases today, but all planned work counts in a discipline, and
    `sdp lifecycle` charts all six whether a team uses them or not.
