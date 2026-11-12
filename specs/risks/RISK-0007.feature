@id=RISK-0007
@price-of:DEC-0007 @affects:REQ-lifecycle-view @mitigated-by:REQ-history-lifecycle @due:MS-IOC
Feature: The plan drifts from what happened

  Discipline activity is what is planned, not what was done. When people stop moving work between
  iterations, the lifecycle chart turns back into a drawing, and the gates that ask what a phase
  planned check the wrong work.

  **Watch for:** iterations that end with planned specs still at `draft` or `idea`.
