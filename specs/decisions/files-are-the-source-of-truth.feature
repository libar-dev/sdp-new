@id=files-are-the-source-of-truth @kind=decision
Feature: Files are the source of truth, and the graph built from them is the one read model

  Every command builds the graph from the files. The command line, the MCP tools, the API, check,
  the views and the steps all answer from that graph, so a link is resolved once and every reader
  agrees.

  **Rejected:** a database or a cache kept in sync, a second copy of the truth that brings
  migrations and sync bugs and hides it from grep, git and pull requests; a reader that re-derives
  from the parsed files what the graph already holds.

  Rule: Every reader answers from the graph

    Only what builds the graph reads the parsed files. A reader that needs what the graph does not
    hold by design, such as the text under a line, reads it where it is written.

  Rule: A built graph never changes

    Nothing read from it can be changed, and a change to the files is a new graph.

  Rule: A link is resolved once, when the graph is built

  Rule: Three anti-patterns break it

    - **Parallel pipeline:** a reader that parses or re-reads the files itself.
    - **Lossy local type:** a reader's own copy of part of a node, which drops what it later needs.
    - **Re-derived link:** a reader that rebuilds a map of links the graph already indexes.

  Rule: Every command reads the whole workspace again

    A large repository feels it in every answer.
