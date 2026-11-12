---
id: DEC-0010
kind: decision
title: A link is a property of the key, never of the value
status: accepted
category: architecture
date: 2026-11-12
deciders: [architecture]
iteration: I1
---

# A link is a property of the key, never of the value

## Context

Front matter states facts as keys and values. Some facts are links between nodes — `iteration: E1`
plans work into an iteration — and others are values — `owner: payments`. sdp used to decide by
the value: an attribute whose value happened to be an existing id also became an edge. One fact
could then be written three ways that different readers saw differently: the lifecycle followed the
edge, a gate queried the attribute, and a reference to a renamed or deleted node silently turned
into plain text with no diagnostic. Milestone gates passed for the wrong reason.

## Options

1. **The value decides** (what sdp did): any attribute whose value is a node's id links.
2. **The value decides, but an id-shaped value that resolves to nothing is reported.** Fewer silent
   misses, yet whether a fact links still depends on what exists elsewhere.
3. **The key decides.** Everything under `links:`, and the keys the vocabulary profile names as links
   (the plan and phase relations, each discipline of `activity`, a workspace's own `links`), always
   link; every other key is a value and never links.

## Decision

Option 3. A link key always yields an edge, and its target must resolve: every unresolved reference
is a `dangling-link` error where it is written. A link is also readable as an attribute of the node
it starts from, so `[iteration=E1]` and `-iteration-> #E1` agree whichever way the author wrote it.
An edge is one `(from, rel, to)` fact that keeps every declaration stating it, with the union of
their attributes; declarations that disagree on an attribute are a `link-conflict`. A prose mention
of two nodes that a link already joins adds no `mentions` edge, and a mention is never a link:
the `*` relation of a query does not follow it.

## Consequences

- One fact has one meaning: gates, the lifecycle and the checker read plan facts the same way.
- A typo in a link key's target is an error instead of an inert value; a typo in a value key stays
  a value, as with any free-form attribute ([[DEC-0002]]).
- A workspace that wants another key to link names it under `vocabulary.links`.

~~~gherkin
Scenario: A value that happens to be an id does not link, and a link key that names nothing is an error
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    owner: REQ-b
    iteration: E9
    ---
    # Alpha
    """
  And a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    ---
    # Beta
    """
  When the workspace is checked
  Then the workspace graph has no "owner" edges
  And the check reports "dangling-link" for "REQ-a"
~~~
