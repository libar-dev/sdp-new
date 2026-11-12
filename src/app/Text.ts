/**
 * How answers read as text: one function per kind of answer, used by the
 * command line and the MCP server alike. A list is one item per line with its
 * fields separated by tabs, so it pipes into grep and cut; on a terminal the
 * same fields are aligned in columns and coloured.
 *
 * @sdp is ARCH-reports
 */
import type { NodeRecord } from "../graph/Export.ts"
import { formatPath } from "../graph/Query.ts"
import type { StatusSummary } from "../graph/Status.ts"
import type { ScenarioResult, StepStatus } from "../model/Results.ts"
import type { ListedStep } from "../run/Match.ts"
import type { Answer } from "./Answer.ts"
import type { ArchitectureData, DiagnosticRecord, QueryData, ShowData, VocabularyData } from "./Reading.ts"
import type { GateReport, RunReport } from "./Running.ts"

const onTerminal = process.stdout.isTTY === true
const useColor = onTerminal && !process.env.NO_COLOR
const paint = (code: number) => (text: string) => useColor ? `\u001b[${code}m${text}\u001b[0m` : text
export const c = {
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  blue: paint(34),
  dim: paint(2),
  bold: paint(1)
}

const pad = (text: string, width: number) => text.length >= width ? text : text + " ".repeat(width - text.length)

/** One row per line. A tab or line break inside a field becomes a space, so a row stays one line of as many fields. */
const rows = (items: ReadonlyArray<ReadonlyArray<string>>): string => {
  const cells = items.map((row) => row.map((cell) => cell.replace(/[\t\n\r]+/g, " ")))
  if (!onTerminal) return cells.map((row) => row.join("\t")).join("\n")
  const widths = (cells[0] ?? []).map((_, i) => Math.min(48, Math.max(...cells.map((row) => (row[i] ?? "").length))))
  return cells.map((row) => row.map((cell, i) => i === row.length - 1 ? cell : pad(cell, widths[i]!)).join("  ").trimEnd()).join("\n")
}

const where = (record: { readonly file: string | null; readonly line: number | null }): string =>
  record.file === null ? "" : `${record.file}:${record.line}`

/** The one word worth showing in a listing: the status a node declares or was given by a run, else its stage. */
const state = (node: NodeRecord): string => String(node.attrs.status ?? node.attrs.stage ?? "")

/** What the reader should know about an answer before relying on it: that it is incomplete, and its notes. */
export const remarks = (answer: Answer<unknown>): ReadonlyArray<string> => [
  ...(answer.complete ? [] : ["incomplete: this answer may miss something, the notes say what was not read or not followed"]),
  ...answer.notes.map((note) => `note: ${note}`)
]

/** Nodes, one per line: id, kind, status or stage, title, `file:line`. */
export const nodes = (records: ReadonlyArray<NodeRecord>): string =>
  rows(records.map((node) => [node.id, node.kind, state(node), node.title, where(node)]))

/** The nodes a query found — or, when it was asked for them, the paths that led there. */
export const query = (data: QueryData): string => data.paths ? data.paths.map(formatPath).join("\n") : nodes(data.nodes)

export const show = ({ in: incoming, neighbours, node, out }: ShowData): string => {
  const title = (id: string) => c.dim(id === node.id ? node.title : neighbours.find((n) => n.id === id)?.title ?? "")
  return [
    `${c.bold(node.id)}  ${node.kind}  ${node.title}  ${c.dim(where(node))}`.trimEnd(),
    ...Object.entries(node.attrs).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`),
    ...out.map((edge) => `  -${edge.rel}-> ${edge.to}  ${title(edge.to)}`.trimEnd()),
    ...incoming.map((edge) => `  <-${edge.rel}- ${edge.from}  ${title(edge.from)}`.trimEnd())
  ].join("\n")
}

export const status = (summary: StatusSummary): string => {
  const line = (label: string, text: string) => `${c.bold(pad(label, 13))} ${text}`
  const counts = (label: string, counted: Readonly<Record<string, number>>, none = "—") =>
    line(label, Object.entries(counted).map(([word, n]) => `${word} ${n}`).join(" · ") || none)
  return [
    line("graph", `${summary.nodes} nodes, ${summary.edges} edges, ${summary.specFiles} spec files`),
    counts("kinds", summary.kinds),
    counts("relations", summary.relations),
    counts("stages", summary.stages),
    counts("rules", summary.rules),
    counts("scenarios", summary.scenarios),
    ...(Object.keys(summary.toCome).length > 0 ? [`${counts("still to come", summary.toCome)}  ${c.dim("(examples of work still to come: no regression)")}`] : []),
    counts("gates", summary.gates),
    counts("milestones", summary.milestones),
    ...(Object.keys(summary.stale).length > 0 ? [`${counts("stale", summary.stale)}  ${c.dim("(sdp run refreshes them)")}`] : []),
    line("architecture", `${summary.architecture} node(s) of an architectural kind`),
    counts("check", summary.diagnostics, "no diagnostics")
  ].join("\n")
}

const severityLabel = { error: c.red("error"), warning: c.yellow("warn "), info: c.blue("info ") }

/** Diagnostics, one per line with its hint beneath, then how many there are of each severity. */
export const diagnostics = (found: ReadonlyArray<DiagnosticRecord>): string => {
  const count = (severity: string) => found.filter((diagnostic) => diagnostic.severity === severity).length
  return [
    ...found.map((d) => {
      const location = where(d)
      const hint = d.hint === null ? "" : `\n       ${c.dim(`→ ${d.hint}`)}`
      return `${severityLabel[d.severity]} ${c.dim(`[${d.rule}]`)} ${d.message}${location ? c.dim(`  ${location}`) : ""}${hint}`
    }),
    c.dim(`${count("error")} error(s), ${count("warning")} warning(s), ${count("info")} info`)
  ].join("\n")
}

/** Step definitions, one per line: `file:line`, keyword, expression. */
export const steps = (listed: ReadonlyArray<ListedStep>): string =>
  rows(listed.map((step) => [`${step.file}:${step.line}`, step.keyword, step.expression]))

/**
 * Each architectural node with what it is for and its links; drivers and the code linked to it
 * appear as the nodes it links to, and a driver that shaped it through a feature as `driver,
 * through feature`. What it is for is the first paragraph of its spec — or, for a node declared
 * without one, what the code anchored to it says of itself. Under each piece of code that is it
 * comes its surface: a declaration's shape, or what a file exports. Code that links to it otherwise
 * — that plays a pattern — is followed by the elements that code is. Then the work on it: what is
 * implemented, and what is still to come, ready first. A node no file declares is planned by the
 * work that names it. A title that only repeats the id, as that of an element declared by its code,
 * is left out.
 */
export const architecture = ({ anchor, anchors, architecture, drivers, edges, kinds, work }: ArchitectureData): string => {
  const titles = new Map([...architecture, ...drivers, ...anchors].map((node) => [node.id, node.title]))
  const title = (id: string) => titles.get(id) === id ? "" : titles.get(id) ?? ""
  const code = new Map(anchors.map((record) => [record.id, record]))
  const lines = [`Architecture: ${architecture.length} node(s) of the kinds ${kinds.join(", ")}`]
  for (const node of architecture) {
    const incoming = edges.filter((e) => e.to === node.id)
    const anchoring = incoming.filter((e) => e.rel === anchor && code.has(e.from))
    const described = typeof node.attrs.summary === "string" ? [node.attrs.summary] : anchoring.map((e) => code.get(e.from)?.attrs.doc)
    const named = title(node.id) === "" ? node.id : `${node.id} — ${node.title}`
    const { implemented = [], toCome = [] } = work.find((w) => w.node === node.id) ?? {}
    const by = toCome.length > 0 ? ` by ${toCome.map((item) => item.id).join(", ")}` : ""
    const planned = node.file === null ? `planned${by}: no code declares it yet` : ""
    lines.push("", `${named} (${node.kind})  ${where(node) || planned}`.trimEnd())
    for (const text of described) if (typeof text === "string") lines.push(`  ${text}`)
    for (const edge of edges.filter((e) => e.from === node.id)) lines.push(`  ${node.id} -${edge.rel}-> ${edge.to}  ${title(edge.to)}`.trimEnd())
    for (const edge of incoming) {
      lines.push(`  ${node.id} <-${edge.rel}- ${edge.from}  ${title(edge.from)}`.trimEnd())
      const linked = code.get(edge.from)
      if (linked === undefined) continue
      if (edge.rel === anchor) {
        for (const shape of [linked.attrs.shape, linked.attrs.exports].flat()) if (typeof shape === "string") lines.push(`    ${shape}`)
        continue
      }
      // The elements that code is apply what it links to.
      for (const is of edges.filter((e) => e.from === linked.id && e.rel === anchor && e.to !== node.id)) {
        lines.push(`  ${node.id} <-${edge.rel}- ${is.to}, through ${linked.id}  ${title(is.to)}`.trimEnd())
      }
    }
    for (const driver of drivers) {
      const features = [...new Set(driver.through.filter((route) => route.nodes[0] === node.id).map((route) => route.nodes[1]))]
      if (features.length > 0) lines.push(`  ${driver.id}, through ${features.join(", ")}  ${title(driver.id)}`.trimEnd())
    }
    for (const item of implemented) lines.push(`  implemented: ${item.id}  ${item.title}`)
    for (const item of toCome) lines.push(`  still to come: ${item.id}${stageOf(item)}  ${item.title}`)
  }
  return lines.join("\n")
}

/** How far work still to come has come, as ` (ready)`. */
const stageOf = (record: NodeRecord): string => typeof record.attrs.stage === "string" ? ` (${record.attrs.stage})` : ""

/** The vocabulary profile, one line per role — `role  word, word` — then the words sdp makes itself. */
export const vocabulary = (data: VocabularyData): string => {
  const words = (value: unknown) => Array.isArray(value) ? value.join(", ") || "—" : String(value)
  const roles = (section: object) => Object.entries(section).map(([role, its]) => `  ${pad(role, 18)} ${words(its)}`)
  return [
    ...Object.entries(data.vocabulary).flatMap(([section, value]) =>
      Array.isArray(value) || typeof value !== "object" || value === null ? [`${pad(section, 20)} ${words(value)}`] : [section, ...roles(value)]
    ),
    "made by sdp, not configurable",
    ...roles(data.made)
  ].join("\n")
}

const statusIcon: Record<StepStatus, string> = {
  passed: c.green("✔"),
  failed: c.red("✘"),
  pending: c.yellow("…"),
  undefined: c.yellow("?"),
  ambiguous: c.red("‼"),
  skipped: c.dim("-")
}

/**
 * A scenario's result line, then each step that did not pass (all with `verbose`) and where a failing
 * one is defined. An example of work still to come says so: what it did fails no run.
 */
export const scenario = (r: ScenarioResult, options: { readonly verbose: boolean; readonly toCome?: boolean | undefined }): string => {
  const lines = [`${statusIcon[r.status]} ${pad(r.status, 9)} ${r.id} ${c.dim(`${r.file}:${r.line}${options.toCome ? "  still to come" : ""}`)}`]
  if (r.status === "passed" && !options.verbose) return lines.join("\n")
  for (const pickle of r.examples) {
    // An example without step results is one the run did not select.
    const unselected = pickle.status === "skipped" && pickle.steps.length === 0 ? c.dim("  not selected") : ""
    if (r.examples.length > 1 && pickle.status !== "passed") {
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

const tallied = (counts: Readonly<Record<string, number>>) =>
  Object.entries(counts).filter(([, n]) => n > 0).map(([word, n]) => `${n} ${word}`).join(", ") || "none"

const total = (counts: Readonly<Record<string, number>>) => Object.values(counts).reduce((sum, n) => sum + n, 0)

/** What a run amounts to, after its scenarios were printed one by one: counts, what it left stale, the suggested step definitions. */
export const runSummary = (report: RunReport | GateReport): string => {
  const scenarios = total(report.summary)
  const gates = total(report.gates)
  const gated = "milestone" in report
  const of = gated ? ` of ${report.milestone}` : ""
  const unselected = report.scenarios.flatMap((r) => r.examples.filter((p) => p.status === "skipped" && p.steps.length === 0)).length
  const stale = total(report.stale)
  const undefinedSteps = report.scenarios.some((r) => r.examples.some((p) => p.steps.some((s) => s.snippet !== undefined)))
  const toCome = total(report.toCome)
  return [
    "",
    ...(scenarios > 0 || (gates === 0 && !gated && toCome === 0) ? [`${scenarios} scenario(s): ${tallied(report.summary)}`] : []),
    ...(toCome > 0 ? [`${toCome} scenario(s) of work still to come, none of which fails the run: ${tallied(report.toCome)}`] : []),
    ...(gates > 0 || (gated && report.met === undefined) ? [`${gates} gate scenario(s)${of}: ${tallied(report.gates)}`] : []),
    ...(gated && report.met !== undefined
      ? [gates > 0 ? `${report.milestone} is recorded as met: ${report.met}` : `${report.milestone} was met on ${report.met}: it is closed, and its gate does not run again`]
      : []),
    ...(unselected > 0
      ? [c.dim(`${unselected} example(s) not selected are skipped: a scenario passes only when one run passes all its examples`)]
      : []),
    ...(stale > 0 ? [c.yellow(`stale: ${stale} earlier result(s) no longer count (${tallied(report.stale)}); run them again`)] : []),
    ...(report.snippets !== undefined
      ? [`\nStep definitions for the undefined steps:\n\n${report.snippets}`]
      : report.summary.undefined > 0
      ? [c.red("a step of implemented work has no definition: it was renamed or removed, or the work is still to come and its maturity says otherwise; --snippets prints a step definition module")]
      : undefinedSteps
      ? [c.dim("undefined steps describe behaviour not automated yet; --snippets prints a step definition module for them")]
      : [])
  ].join("\n")
}
