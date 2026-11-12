@id=link-attributes-on-annotations @kind=change @maturity=draft
@changes:link-code-to-specs
Feature: Link attributes on annotations

  Only a comment annotation can give the link it states attributes of its own
  (`@sdp uses ARCH-ledger via=events`): a tag links with `@rel:ID` alone, and a typed annotation's
  attributes describe the node it declares. For these attributes alone, the declarations of one
  link are merged key by key and `link-conflict` reports where they disagree. Removing them would
  leave a link its two ends and where it is declared, and `key=value` on an annotation would only
  ever describe a node.

  @open
  Rule: Only a code annotation can still give a link attributes (`@sdp uses X via=events`): are they worth the merging of declarations and link-conflict that exist for them?

    Proposed: remove them; nothing in this repository uses them.
