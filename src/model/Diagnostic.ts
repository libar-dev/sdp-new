import type { SourceRef } from "./Graph.ts"

export type Severity = "error" | "warning" | "info"

/**
 * Every rule sdp can report, with its severity. Diagnostics can only name a
 * rule listed here, so this is the complete catalogue (specified, with an
 * example per rule, in check-specs).
 */
export const rules = {
  "duplicate-id": "error",
  "dangling-link": "error",
  "declared-in-spec": "error",
  "link-syntax": "error",
  "tag-syntax": "error",
  "declaration-conflict": "warning",
  "derived-attribute": "error",
  "gherkin-syntax": "error",
  "not-a-spec": "warning",
  "not-a-file": "error",
  "description-comment": "warning",
  "scenario-empty": "warning",
  "scenario-outside-rule": "error",
  "untested-feature": "error",
  "untested-rule": "error",
  "question-example": "error",
  "replacement": "error",
  "replaces-nothing": "warning",
  "maturity-off-ladder": "error",
  "maturity-on-no-work": "warning",
  "demotion": "error",
  "example-dropped": "error",
  "decision-shape": "warning",
  "template-placeholder": "warning",
  "plan-reference": "warning",
  "plan-date": "warning",
  "milestone-met": "warning",
  "annotation-ignored": "warning",
  "annotation-unreadable": "warning",
  "import-unresolved": "warning",
  "return-type": "warning",
  "step-unreadable": "warning",
  "step-expression": "error",
  "import-config-outside": "info"
} as const satisfies Record<string, Severity>

export type RuleId = keyof typeof rules

/**
 * The rules that report part of the workspace as not read — a spec that does not parse or that
 * declares what only code declares, a path the globs match that is no file, an id declared twice, a
 * tag or a code annotation whose fact or link is dropped, written where it annotates nothing, or
 * given a value another declaration of its node overrides, or an import whose module sdp cannot
 * follow. What they name is missing from the graph, so no answer drawn from the graph is known to
 * be complete while one of them is reported.
 */
export const unreadRules: ReadonlySet<RuleId> = new Set([
  "gherkin-syntax",
  "declared-in-spec",
  "not-a-file",
  "duplicate-id",
  "tag-syntax",
  "link-syntax",
  "annotation-unreadable",
  "annotation-ignored",
  "import-unresolved",
  "declaration-conflict"
])

/** A diagnostic on one line: `file:line [rule] message`. */
export const problemLine = (diagnostic: Diagnostic): string =>
  `${diagnostic.source ? `${diagnostic.source.file}:${diagnostic.source.line}` : "?"} [${diagnostic.rule}] ${diagnostic.message.replace(/\s*\n\s*/g, " ")}`

export const isRuleId = (value: string): value is RuleId => Object.hasOwn(rules, value)

export interface Diagnostic {
  /** Stable rule id, e.g. `dangling-link`. Grep for it in specs to learn more. */
  readonly rule: RuleId
  readonly severity: Severity
  readonly message: string
  readonly node?: string | undefined
  readonly source?: SourceRef | undefined
  /** What to do about it, phrased so an agent can act on it. */
  readonly hint?: string | undefined
}

/** A diagnostic of `rule`, as severe as the catalogue says that rule is. */
export const diagnostic = (rule: RuleId, about: Omit<Diagnostic, "rule" | "severity">): Diagnostic => ({ rule, severity: rules[rule], ...about })

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
