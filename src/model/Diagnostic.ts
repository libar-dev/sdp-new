import type { SourceRef } from "./Graph.ts"

export type Severity = "error" | "warning" | "info"

export interface Diagnostic {
  /** Stable rule id, e.g. `maturity-gate`. Grep for it in docs to learn more. */
  readonly rule: string
  readonly severity: Severity
  readonly message: string
  readonly node?: string | undefined
  readonly source?: SourceRef | undefined
  /** What to do about it, phrased so an agent can act on it. */
  readonly hint?: string | undefined
}

const severityRank: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

export const sortDiagnostics = (diagnostics: ReadonlyArray<Diagnostic>): ReadonlyArray<Diagnostic> =>
  [...diagnostics].sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    (a.source?.file ?? "").localeCompare(b.source?.file ?? "") ||
    (a.source?.line ?? 0) - (b.source?.line ?? 0) ||
    a.rule.localeCompare(b.rule)
  )
