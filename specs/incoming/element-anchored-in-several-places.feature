@id=element-anchored-in-several-places @kind=change @maturity=idea
@changes:see-the-architecture
Feature: An element anchored in several places

  Architects anchor an element where each part of its code is, and no spec declares it once. Today
  the anchor in the first file by path declares it — its title, its kind, its attributes and the
  line `sdp arch` shows it at — and what the other anchors declare is dropped without a word, so
  renaming a file can change them.

  @open
  Rule: When an element is anchored in several places, which anchor declares it?
