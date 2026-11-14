@id=write-specs-in-an-editor @maturity=idea
Feature: Write specs in an editor

  Authors write specs in their editor, and want it to know what sdp knows of them: without that, an
  id typed wrong shows up only when `sdp check` runs.

  Rule: An id or a relation name in a tag is completed from those the graph declares and uses

  Rule: Go to definition leads from an id in a tag, in a spec or in code, to its declaration

  Rule: The diagnostics of sdp check show at their line
