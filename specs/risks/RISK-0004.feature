@id=RISK-0004
@price-of:DEC-0005 @affects:REQ-maturity-criteria @mitigated-by:REQ-executable-specs @mitigated-by:REQ-review-bot @due:MS-IOC
Feature: Teams do not keep maturity honest

  The maturity criteria check the shape of a spec — a description exists, a scenario states an
  outcome, no question is open — not whether the content is any good. Under pressure a team can
  satisfy `ready` with a placeholder paragraph and a token scenario, or leave specs at `draft` long
  after they are understood. Plans and gates built on maturity then mislead.

  **Watch for:** ready specs whose scenarios stay undefined for several iterations.
