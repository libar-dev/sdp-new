import type { SourceRef } from "./Graph.ts"

export type Severity = "error" | "warning" | "info"

/**
 * Every rule sdp can report, with its severity. Diagnostics can only name a
 * rule listed here, so this is the complete catalogue (specified, with an
 * example per rule, in REQ-check-rules).
 */
export const rules = {
  "front-matter": "error",
  "missing-id": "warning",
  "duplicate-id": "error",
  "dangling-link": "error",
  "link-syntax": "warning",
  "link-conflict": "warning",
  "derived-attribute": "error",
  "inline-node": "warning",
  "gherkin-syntax": "error",
  "scenario-empty": "warning",
  "maturity-value": "error",
  "maturity-gate": "error",
  "maturity-promotable": "info",
  "decision-status": "warning",
  "decision-supersede": "warning",
  "decision-content": "info",
  "template-placeholder": "warning",
  "plan-reference": "warning",
  "annotation-ignored": "warning",
  "annotation-unreadable": "warning",
  "types-stale": "warning"
} as const satisfies Record<string, Severity>

export type RuleId = keyof typeof rules

export const isRuleId = (value: string): value is RuleId => Object.hasOwn(rules, value)

export interface Diagnostic {
  /** Stable rule id, e.g. `maturity-gate`. Grep for it in specs to learn more. */
  readonly rule: RuleId
  readonly severity: Severity
  readonly message: string
  readonly node?: string | undefined
  readonly source?: SourceRef | undefined
  /** What to do about it, phrased so an agent can act on it. */
  readonly hint?: string | undefined
}

export const severityRank: Readonly<Record<Severity, number>> = { error: 0, warning: 1, info: 2 }

/** Whether `severity` is at least as severe as `minimum`. */
export const atLeast = (severity: Severity, minimum: Severity): boolean => severityRank[severity] <= severityRank[minimum]

export const sortDiagnostics = (diagnostics: ReadonlyArray<Diagnostic>): ReadonlyArray<Diagnostic> =>
  [...diagnostics].sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    (a.source?.file ?? "").localeCompare(b.source?.file ?? "") ||
    (a.source?.line ?? 0) - (b.source?.line ?? 0) ||
    a.rule.localeCompare(b.rule)
  )
