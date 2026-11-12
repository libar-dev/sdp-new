import { statusCell } from "../graph/Export.ts"
import { formatSource, type GraphNode } from "../model/Graph.ts"
import type { Diagnostic } from "../model/Diagnostic.ts"
import type { ScenarioResult, StepStatus } from "../model/Results.ts"

const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR
const paint = (code: number) => (text: string) => useColor ? `\u001b[${code}m${text}\u001b[0m` : text
export const c = {
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  blue: paint(34),
  magenta: paint(35),
  cyan: paint(36),
  dim: paint(2),
  bold: paint(1)
}

export const pad = (text: string, width: number) => text.length >= width ? text : text + " ".repeat(width - text.length)

/** Aligned plain-text table, one row per line (greppable). */
export const table = (rows: ReadonlyArray<ReadonlyArray<string>>): string => {
  if (rows.length === 0) return ""
  const widths = rows[0]!.map((_, i) => Math.min(48, Math.max(...rows.map((r) => (r[i] ?? "").length))))
  return rows.map((r) => r.map((cell, i) => i === r.length - 1 ? cell : pad(cell, widths[i]!)).join("  ").trimEnd()).join("\n")
}

export const nodeRows = (nodes: ReadonlyArray<GraphNode>) =>
  nodes.map((n) => [n.id, n.kind, statusCell(n), n.title, formatSource(n.source)])

export const statusIcon: Record<StepStatus, string> = {
  passed: c.green("✔"),
  failed: c.red("✘"),
  pending: c.yellow("…"),
  undefined: c.yellow("?"),
  ambiguous: c.red("‼"),
  skipped: c.dim("-")
}

export const formatDiagnostic = (d: Diagnostic) => {
  const sev = d.severity === "error" ? c.red("error") : d.severity === "warning" ? c.yellow("warn ") : c.blue("info ")
  const where = formatSource(d.source)
  return `${sev} ${c.dim(`[${d.rule}]`)} ${d.message}${where ? c.dim(`  ${where}`) : ""}${d.hint ? `\n       ${c.dim(`→ ${d.hint}`)}` : ""}`
}

/** A scenario's result line, then each step that did not pass (all with `verbose`) and where a failing one is defined. */
export const formatScenario = (r: ScenarioResult, options: { readonly verbose: boolean }) => {
  const lines = [`${statusIcon[r.status]} ${pad(r.status, 9)} ${r.id} ${c.dim(`${r.file}:${r.line}`)}`]
  if (r.status === "passed" && !options.verbose) return lines.join("\n")
  for (const pickle of r.pickles) {
    // An example without step results is one the run did not select.
    const unselected = pickle.status === "skipped" && pickle.steps.length === 0 ? c.dim("  not selected") : ""
    if (r.pickles.length > 1 && pickle.status !== "passed") {
      lines.push(`    ${c.dim("example")} ${pickle.name}${pickle.exampleLine ? c.dim(` :${pickle.exampleLine}`) : ""}${unselected}`)
    }
    for (const step of pickle.steps) {
      if (step.status === "passed" && !options.verbose) continue
      if (step.status === "skipped") continue
      const definedAt = step.definition && step.status !== "passed" ? `  ${c.dim(`defined at ${step.definition}`)}` : ""
      lines.push(`      ${statusIcon[step.status]} ${step.keyword} ${step.text} ${c.dim(`:${step.line}`)}${definedAt}`)
      if (step.error) lines.push(...step.error.split("\n").map((l) => `          ${c.red(l)}`))
    }
  }
  return lines.join("\n")
}
