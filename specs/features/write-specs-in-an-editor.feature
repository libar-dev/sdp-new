@id=write-specs-in-an-editor @maturity=draft
Feature: Write specs in an editor

  Authors write specs in their editor, and want it to know what sdp knows of them: without that, an
  id typed wrong or a relation spelled differently shows up only when `sdp check` runs, and finding
  the spec behind an id means a search. A language server gives every editor the same help.

  Rule: An id in a tag is completed from the ids the graph declares

  Rule: A relation name is completed from those the workspace already uses, most used first

    The vocabulary is free, so suggesting the words in use is what keeps it from drifting.

  Rule: Go to definition leads from an id in a tag of a spec or an `@sdp` tag in code to the line that declares it

  Rule: The diagnostics of sdp check show at their line, with their hint
