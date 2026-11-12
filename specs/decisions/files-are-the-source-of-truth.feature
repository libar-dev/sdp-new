@id=files-are-the-source-of-truth @kind=decision
Feature: Files are the source of truth; every command rebuilds the graph

  Not a database or a cache kept in sync: a second copy of the truth brings migrations and sync
  bugs, and hides it from grep, git and pull requests. The price is that every command reads and
  parses the whole workspace again, which a large repository feels in every answer.
