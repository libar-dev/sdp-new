/**
 * Builds the whole-system graph from parsed sources. Files are the source of
 * truth; the graph is a derived, disposable index that can be rebuilt at any
 * time (and exported for grep/jq). Building is pure: no IO happens here.
 */
import { annotate } from "../annotations.ts"
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import { Graph, type GraphEdge, type GraphNode, type SourceRef } from "../model/Graph.ts"
import { type Annotation, codeNodeId, ignoredAnnotations, scanAnnotations } from "../parse/Annotations.ts"
import { scanTypedAnnotations } from "../parse/TypedAnnotations.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import { parseFeatureSpec, parseMarkdownSpec, type Spec } from "../parse/Spec.ts"
import { type RunResults, type StepStatus, type Verification, verificationOf } from "../run/Results.ts"

export interface SourceFile {
  readonly path: string
  readonly content: string
}

export interface ProjectInput {
  readonly root: string
  readonly config: Config
  readonly specFiles: ReadonlyArray<SourceFile>
  readonly featureFiles: ReadonlyArray<SourceFile>
  readonly codeFiles: ReadonlyArray<SourceFile>
  readonly results?: RunResults | undefined
  /** The id declarations currently on disk at `config.types`, if any (to tell when they are stale). */
  readonly types?: string | undefined
}

export interface Project {
  readonly root: string
  readonly config: Config
  readonly specs: ReadonlyArray<Spec>
  readonly specById: ReadonlyMap<string, Spec>
  readonly annotations: ReadonlyArray<Annotation>
  readonly graph: Graph
  /** Problems found while reading sources and linking the graph (`sdp check` adds rule checks). */
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly results: RunResults | undefined
  readonly types: string | undefined
}

/** Attribute keys whose values are never turned into implicit links. */
const notLinks = new Set(["id", "kind", "title", "summary", "maturity", "status", "stage", "verification", "tags", "file", "type", "declaredIn"])

/** Builds the whole-system graph from parsed sources — specs, annotations and stored results — without any IO. */
export const buildProject = (input: ProjectInput): Project => {
  const diagnostics: Array<Diagnostic> = []
  const specs: Array<Spec> = []
  for (const file of input.specFiles) {
    const parsed = parseMarkdownSpec(file.path, file.content, input.config)
    diagnostics.push(...parsed.diagnostics)
    if (parsed.spec) specs.push(parsed.spec)
  }
  for (const file of input.featureFiles) {
    const parsed = parseFeatureSpec(file.path, file.content, input.config)
    diagnostics.push(...parsed.diagnostics)
    if (parsed.spec) specs.push(parsed.spec)
  }
  const annotations: Array<Annotation> = []
  for (const file of input.codeFiles) {
    annotations.push(...scanAnnotations(file.path, file.content))
    const typed = scanTypedAnnotations(file.path, file.content)
    annotations.push(...typed.annotations)
    for (const problem of typed.problems) {
      diagnostics.push({
        rule: "annotation-unreadable",
        severity: "warning",
        message: problem.message,
        source: { file: file.path, line: problem.line },
        hint: "write ids and attributes as literals, e.g. annotate(Graph, { is: \"ARCH-graph\" })"
      })
    }
  }
  for (const file of input.codeFiles) {
    for (const ignored of ignoredAnnotations(file.content)) {
      diagnostics.push({
        rule: "annotation-ignored",
        severity: "warning",
        message: `"${ignored.text}" follows code on the same line, so it is not read as an annotation`,
        source: { file: file.path, line: ignored.line },
        hint:
          "put it on a comment line of its own: directly above a declaration it binds to that declaration, followed by a blank line to the whole file"
      })
    }
  }

  const nodes = new Map<string, GraphNode>()
  const edges: Array<GraphEdge> = []
  const declare = (node: GraphNode) => {
    const existing = nodes.get(node.id)
    if (existing) {
      diagnostics.push({
        rule: "duplicate-id",
        severity: "error",
        message: `id ${node.id} is already declared at ${fmt(existing.source)}`,
        node: node.id,
        source: node.source,
        hint: "ids must be unique across the workspace; rename one of them"
      })
      return
    }
    nodes.set(node.id, node)
  }

  const specById = new Map<string, Spec>()
  for (const spec of specs) {
    if (!specById.has(spec.id)) specById.set(spec.id, spec)
    const statuses: Array<StepStatus | undefined> = []
    for (const scenario of spec.scenarios) {
      const result = input.results?.scenarios[scenario.id]
      const stale = result !== undefined && result.hash !== scenario.hash
      const status = result && !stale ? result.status : undefined
      statuses.push(status)
      declare({
        id: scenario.id,
        kind: "scenario",
        title: scenario.name,
        attrs: compact({
          spec: spec.id,
          keyword: scenario.keyword,
          tags: scenario.tags.length > 0 ? scenario.tags : undefined,
          rule: scenario.rule,
          steps: scenario.steps.length,
          examples: scenario.pickles.length > 1 ? scenario.pickles.length : undefined,
          status: status ?? (stale ? "stale" : "unrun"),
          lastRun: result?.runAt,
          hash: scenario.hash
        }),
        source: { file: spec.file, line: scenario.line }
      })
      edges.push({ from: scenario.id, rel: "verifies", to: spec.id, source: { file: spec.file, line: scenario.line } })
    }
    const verification: Verification = verificationOf(statuses)
    const openQuestions = spec.openQuestions.filter((q) => !q.resolved).length
    declare({
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      attrs: compact({
        ...spec.attrs,
        file: spec.file,
        summary: spec.summary || undefined,
        scenarios: spec.scenarios.length,
        verification,
        stage: stageOf(spec.attrs.maturity, verification),
        openQuestions: openQuestions > 0 ? openQuestions : undefined
      }),
      source: { file: spec.file, line: 1 }
    })
    for (const inline of spec.inlineNodes) {
      declare({
        id: inline.id,
        kind: inline.kind,
        title: inline.title,
        attrs: { ...inline.attrs, declaredIn: spec.id },
        source: { file: spec.file, line: inline.line }
      })
    }
  }

  // Code: annotated locations become `code` nodes; `is` may declare the node it anchors.
  for (const annotation of annotations) {
    const id = codeNodeId(annotation)
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        kind: "code",
        title: annotation.symbol ?? annotation.file,
        attrs: compact({ file: annotation.file, symbol: annotation.symbol, doc: annotation.doc }),
        source: { file: annotation.file, line: annotation.symbolLine ?? annotation.line }
      })
    }
  }
  for (const annotation of annotations.filter((a) => a.rel === "is")) {
    for (const target of annotation.targets) {
      const existing = nodes.get(target)
      const { kind, title, ...attrs } = annotation.attrs
      if (!existing) {
        nodes.set(target, {
          id: target,
          kind: Predicate.isString(kind) ? kind : "element",
          title: Predicate.isString(title) ? title : target,
          attrs: { ...attrs, declaredIn: "code" },
          source: { file: annotation.file, line: annotation.line }
        })
      } else if (Object.keys(attrs).length > 0) {
        nodes.set(target, { ...existing, attrs: { ...attrs, ...existing.attrs } })
      }
    }
  }

  // Edges.
  for (const spec of specs) {
    for (const link of spec.links) {
      edges.push({ from: spec.id, rel: link.rel, to: link.to, attrs: link.attrs, source: { file: spec.file, line: link.line } })
    }
    for (const inline of spec.inlineNodes) {
      for (const link of inline.links) {
        edges.push({ from: inline.id, rel: link.rel, to: link.to, attrs: link.attrs, source: { file: spec.file, line: link.line } })
      }
    }
    for (const ref of spec.references) {
      if (ref.id === spec.id) continue
      edges.push({ from: spec.id, rel: ref.rel ?? "mentions", to: ref.id, source: { file: spec.file, line: ref.line } })
    }
  }
  for (const annotation of annotations) {
    const from = codeNodeId(annotation)
    const { kind: _k, title: _t, ...attrs } = annotation.attrs
    for (const to of annotation.targets) {
      edges.push({
        from,
        rel: annotation.rel,
        to,
        attrs: annotation.rel === "is" || Object.keys(attrs).length === 0 ? undefined : attrs,
        source: { file: annotation.file, line: annotation.line }
      })
    }
  }
  // Implicit links: an attribute whose value is a known id becomes an edge named after the key
  // (`iteration: E2` → `-iteration-> E2`). Explicit links are never required for the obvious ones.
  for (const node of [...nodes.values()]) {
    if (node.kind === "scenario" || node.kind === "code") continue
    const spec = specById.get(node.id)
    for (const [key, value] of Object.entries(node.attrs)) {
      if (notLinks.has(key)) continue
      const values = Array.isArray(value) ? value : [value]
      const line = spec?.attrLines[key]
      const source = node.source && line !== undefined ? { file: node.source.file, line } : node.source
      for (const v of values) {
        if (Predicate.isString(v) && v !== node.id && nodes.has(v)) {
          edges.push({ from: node.id, rel: key, to: v, attrs: { implicit: true }, source })
        }
      }
    }
  }

  // Unresolved references stay visible as `missing` nodes so they can be queried and fixed.
  for (const edge of edges) {
    if (nodes.has(edge.to)) continue
    diagnostics.push({
      rule: "dangling-link",
      severity: "error",
      message: `${edge.from} -${edge.rel}-> ${edge.to}: no node has id ${edge.to}`,
      node: edge.from,
      source: edge.source,
      hint: `create a spec with \`id: ${edge.to}\` (sdp new) or fix the reference`
    })
    nodes.set(edge.to, { id: edge.to, kind: "missing", title: edge.to, attrs: {} })
  }

  return {
    root: input.root,
    config: input.config,
    specs,
    specById,
    annotations,
    graph: new Graph(nodes.values(), edges),
    diagnostics: sortDiagnostics(diagnostics),
    results: input.results,
    types: input.types
  }
}
annotate(buildProject, { is: "ARCH-graph-builder", "instance-of": ["PAT-derived-index", "PAT-pipes-and-filters"] })

/** Records that no longer apply keep their text but stop guarding anything. */
export const inactiveStatuses: ReadonlySet<string> = new Set(["superseded", "rejected", "deprecated"])

export const isActive = (spec: { readonly attrs: Readonly<Record<string, unknown>> }): boolean =>
  !inactiveStatuses.has(String(spec.attrs.status ?? ""))

/** Gate scenarios run after all others: those of milestones and those tagged `@gate`. */
export const isGate = (scenario: Scenario, spec: Spec): boolean =>
  spec.kind === "milestone" || scenario.pickles.some((pickle) => pickle.tags.includes("@gate"))

/**
 * Where a spec is in delivery: its declared authoring maturity until automation
 * exists, then `in-progress` while scenarios are pending/failing and `verified`
 * once they all pass. Implemented and unimplemented specs share one format;
 * evidence, not a status field, says which is which.
 */
export const stageOf = (maturity: unknown, verification: Verification): string | undefined =>
  verification === "passing"
    ? "verified"
    : verification === "failing" || verification === "pending"
    ? "in-progress"
    : Predicate.isString(maturity)
    ? maturity
    : undefined

const compact = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined))

const fmt = (source: SourceRef | undefined) => source ? `${source.file}:${source.line}` : "?"
