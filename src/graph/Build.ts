/**
 * Builds the whole-system graph from parsed sources. Files are the source of
 * truth; the graph is a derived, disposable index that can be rebuilt at any
 * time (and exported for grep/jq). Building is pure: no IO happens here.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, rules, sortDiagnostics } from "../model/Diagnostic.ts"
import { type Attrs, Graph, type GraphEdge, type GraphNode, mergeEdges, type SourceRef } from "../model/Graph.ts"
import { type RunResults, type StepStatus, type Verification, verificationOf } from "../model/Results.ts"
import {
  activityRelation,
  attribute,
  hasKind,
  hasRelation,
  isDerived,
  linkKeys,
  made,
  type Words
} from "../model/Vocabulary.ts"
import { type Annotation, codeNodeId, scanCode } from "../parse/Annotations.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import { linksOfKey, parseFeatureSpec, parseMarkdownSpec, type Spec } from "../parse/Spec.ts"
import { scanStepDefinitions, type StepSignature } from "../parse/StepDefinitions.ts"

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
  /** The step definition files: their definitions are read statically, never run. */
  readonly stepFiles?: ReadonlyArray<SourceFile> | undefined
  /** What the stored results say about the parsed specs' scenarios; without it the graph shows no results. */
  readonly evidence?: ((specs: ReadonlyArray<Spec>) => EvidenceView) | undefined
  /** The id declarations currently on disk at `config.types`, if any (to tell when they are stale). */
  readonly types?: string | undefined
}

/** Where a scenario's stored result stands: its status while the result still counts, else why it does not. */
export interface Settled {
  readonly status: StepStatus | undefined
  /** What changed since the result was recorded, when it no longer counts. */
  readonly stale: string | undefined
  readonly lastRun: string | undefined
}

/**
 * The stored results as the graph is to show them. Which results count, and for whom, is decided
 * on the runner's side (`src/run/Evidence.ts`); the builder only places the answers on the nodes.
 */
export interface EvidenceView {
  readonly results: RunResults | undefined
  readonly settle: (scenario: Scenario) => Settled
}

/** The step definitions of the workspace, as read from its step files without running them. */
export interface ProjectSteps {
  /** Step definition files, relative to the workspace root. */
  readonly files: ReadonlyArray<string>
  readonly definitions: ReadonlyArray<StepSignature>
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
  readonly steps: ProjectSteps
}

/** Builds the whole-system graph from parsed sources — specs, annotations and stored results — without any IO. */
export const buildProject = (input: ProjectInput): Project => {
  const vocabulary = input.config.vocabulary
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
    const scan = scanCode(file.path, file.content, vocabulary.relations.anchor)
    annotations.push(...scan.annotations)
    for (const problem of scan.unreadable) {
      diagnostics.push({
        rule: "annotation-unreadable",
        severity: "warning",
        message: problem.message,
        source: { file: file.path, line: problem.line },
        hint: problem.hint ?? "write ids and attributes as literals, e.g. annotate(Graph, { is: \"ARCH-graph\" })"
      })
    }
    for (const ignored of scan.ignored) {
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
  const stepDefinitions: Array<StepSignature> = []
  for (const file of input.stepFiles ?? []) {
    const scan = scanStepDefinitions(file.path, file.content)
    stepDefinitions.push(...scan.definitions)
    for (const problem of scan.problems) {
      diagnostics.push({
        rule: problem.rule,
        severity: rules[problem.rule],
        message: problem.message,
        source: { file: file.path, line: problem.line },
        hint: problem.rule === "step-expression"
          ? "fix the Cucumber Expression: {int}, {float}, {word}, {string} and {} are the parameters, and ( ) / { } \\ are escaped with a backslash"
          : "register steps in a top-level `defineSteps(world, ({ Given }) => { Given(\"…\", …) })` with literal expressions; until then context, snippets and `sdp steps` do not know them"
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
      return false
    }
    nodes.set(node.id, node)
    return true
  }
  /** An authored node's attributes without those sdp derives; each one written is reported where it is. */
  const authored = (id: string, kind: string, attrs: Attrs, at: (key: string) => SourceRef): Record<string, unknown> => {
    const kept: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs)) {
      if (!isDerived(kind, key)) {
        kept[key] = value
        continue
      }
      diagnostics.push({
        rule: "derived-attribute",
        severity: "error",
        message: `${id}: ${key} is derived by sdp, so the value written here is ignored`,
        node: id,
        source: at(key),
        hint: `delete \`${key}\`; sdp computes it (\`sdp vocabulary\` lists what it derives)`
      })
    }
    return kept
  }
  /** The stage of a node without scenarios: its maturity, while that is a level of the ladder. */
  const declaredStage = (attrs: Attrs) => stageOf(attrs.maturity, "none", vocabulary.maturity)
  /** Authored nodes, with where each writes its attributes, so the links those hold point at the right line. */
  const writtenAt = new Map<string, (key: string) => SourceRef>()

  const evidence = input.evidence?.(specs)
  const unrun: Settled = { status: undefined, stale: undefined, lastRun: undefined }

  const specById = new Map<string, Spec>()
  for (const spec of specs) {
    if (!specById.has(spec.id)) specById.set(spec.id, spec)
    const statuses: Array<StepStatus | undefined> = []
    for (const scenario of spec.scenarios) {
      const { lastRun, stale, status } = evidence?.settle(scenario) ?? unrun
      statuses.push(status)
      declare({
        id: scenario.id,
        kind: made.kinds.scenario,
        title: scenario.name,
        attrs: compact({
          spec: spec.id,
          keyword: scenario.keyword,
          tags: scenario.tags.length > 0 ? scenario.tags : undefined,
          rule: scenario.rule,
          steps: scenario.steps.length,
          examples: scenario.pickles.length > 1 ? scenario.pickles.length : undefined,
          status: status ?? (stale ? "stale" : "unrun"),
          staleBecause: stale,
          lastRun,
          hash: scenario.hash
        }),
        source: { file: spec.file, line: scenario.line }
      })
      edges.push({ from: scenario.id, rel: vocabulary.relations.scenario, to: spec.id, source: { file: spec.file, line: scenario.line } })
    }
    const verification: Verification = verificationOf(statuses)
    const openQuestions = spec.openQuestions.filter((q) => !q.resolved).length
    const at = (key: string): SourceRef => ({ file: spec.file, line: lineOfKey(spec.attrLines, key) ?? 1 })
    const attrs = authored(spec.id, spec.kind, spec.attrs, at)
    const declared = declare({
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      attrs: compact({
        ...attrs,
        file: spec.file,
        summary: spec.summary || undefined,
        scenarios: spec.scenarios.length,
        verification,
        stage: stageOf(attrs.maturity, verification, vocabulary.maturity),
        openQuestions: openQuestions > 0 ? openQuestions : undefined
      }),
      source: { file: spec.file, line: 1 }
    })
    if (declared) writtenAt.set(spec.id, at)
    for (const inline of spec.inlineNodes) {
      const at = (key?: string): SourceRef => ({
        file: spec.file,
        line: (key === undefined ? undefined : lineOfKey(inline.attrLines, key)) ?? inline.line
      })
      const attrs = authored(inline.id, inline.kind, inline.attrs, at)
      const declared = declare({
        id: inline.id,
        kind: inline.kind,
        title: inline.title,
        attrs: compact({ ...attrs, stage: declaredStage(attrs), declaredIn: spec.id }),
        source: at()
      })
      if (declared) writtenAt.set(inline.id, at)
    }
  }

  // Code: annotated locations become `code` nodes; the anchor relation may declare the node it anchors.
  for (const annotation of annotations) {
    const id = codeNodeId(annotation)
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        kind: made.kinds.code,
        title: annotation.symbol ?? annotation.file,
        attrs: compact({ file: annotation.file, symbol: annotation.symbol, doc: annotation.doc }),
        source: { file: annotation.file, line: annotation.symbolLine ?? annotation.line }
      })
    }
  }
  for (const annotation of annotations.filter((a) => a.rel === vocabulary.relations.anchor)) {
    for (const target of annotation.targets) {
      const existing = nodes.get(target)
      const { kind: rawKind, title, ...rest } = annotation.attrs
      const kind = Predicate.isString(rawKind) ? rawKind : existing?.kind ?? vocabulary.kinds.anchored
      const at = (): SourceRef => ({ file: annotation.file, line: annotation.line })
      const attrs = authored(target, kind, rest, at)
      if (!existing) {
        nodes.set(target, {
          id: target,
          kind,
          title: Predicate.isString(title) ? title : target,
          attrs: compact({ ...attrs, stage: declaredStage(attrs), declaredIn: made.declaredInCode }),
          source: at()
        })
        writtenAt.set(target, at)
      } else if (Object.keys(attrs).length > 0) {
        nodes.set(target, { ...existing, attrs: { ...attrs, ...existing.attrs } })
      }
    }
  }

  // Links are a property of the key, never of the value: everything under `links:`, and the keys the
  // vocabulary names as links — plan and phase relations, each discipline of `activity`, and the
  // workspace's own link keys. Every other attribute is a value.
  for (const spec of specs) {
    for (const link of spec.links) {
      edges.push({ from: spec.id, rel: link.rel, to: link.to, attrs: link.attrs, source: { file: spec.file, line: link.line } })
    }
    for (const inline of spec.inlineNodes) {
      for (const link of inline.links) {
        edges.push({ from: inline.id, rel: link.rel, to: link.to, attrs: link.attrs, source: { file: spec.file, line: link.line } })
      }
    }
  }
  /** The link keys a node writes with their values; each discipline of `activity` under its path. */
  const writtenLinks = (node: GraphNode): ReadonlyArray<readonly [string, unknown]> => {
    const keys = linkKeys(vocabulary).filter((key) => Object.hasOwn(node.attrs, key))
    const linked = keys.map((key) => [key, node.attrs[key]] as const)
    const activity = attribute(node, vocabulary.attributes.activity)
    if (!Predicate.isObject(activity) || Array.isArray(activity)) return linked
    return [...linked, ...Object.entries(activity).map(([discipline, value]) => [activityRelation(vocabulary, discipline), value] as const)]
  }
  for (const [id, at] of writtenAt) {
    for (const [rel, value] of writtenLinks(nodes.get(id)!)) {
      const source = at(rel)
      const links = linksOfKey(rel, value, { file: source.file, owner: id, line: source.line }, diagnostics)
      for (const link of links) edges.push({ from: id, rel: link.rel, to: link.to, attrs: link.attrs, source })
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
        attrs: annotation.rel === vocabulary.relations.anchor || Object.keys(attrs).length === 0 ? undefined : attrs,
        source: { file: annotation.file, line: annotation.line }
      })
    }
  }
  // A prose mention is not a link: it adds an edge only between nodes no authored link joins.
  const joined = new Set(edges.flatMap((edge) => [`${edge.from}\u0000${edge.to}`, `${edge.to}\u0000${edge.from}`]))
  for (const spec of specs) {
    for (const ref of spec.references) {
      if (ref.id === spec.id) continue
      const rel = ref.rel ?? vocabulary.relations.mention
      if (rel === vocabulary.relations.mention && joined.has(`${spec.id}\u0000${ref.id}`)) continue
      edges.push({ from: spec.id, rel, to: ref.id, source: { file: spec.file, line: ref.line } })
    }
  }

  // Every reference to an unknown id is reported where it is written; the id stays visible as one
  // `missing` node, so it can be queried and fixed.
  const declaredIds = new Set(nodes.keys())
  const iterations = [...nodes.values()].filter((n) => hasKind(vocabulary, "iteration", n.kind)).map((n) => n.id)
  const phases = [...nodes.values()].filter((n) => hasKind(vocabulary, "phase", n.kind)).map((n) => n.id)
  const activityPrefix = `${vocabulary.attributes.activity}.`
  const hintFor = (edge: GraphEdge) => {
    const known = hasRelation(vocabulary, "phase", edge.rel)
      ? { what: "phase", ids: phases }
      : hasRelation(vocabulary, "plan", edge.rel) || edge.rel.startsWith(activityPrefix)
      ? { what: "iteration", ids: iterations }
      : undefined
    return known && known.ids.length > 0
      ? `use one of the declared ${known.what} ids: ${known.ids.join(", ")}`
      : `create a spec with \`id: ${edge.to}\` (sdp new) or fix the reference`
  }
  for (const edge of edges) {
    if (declaredIds.has(edge.to)) continue
    diagnostics.push({
      rule: "dangling-link",
      severity: "error",
      message: `${edge.from} -${edge.rel}-> ${edge.to}: no node has id ${edge.to}`,
      node: edge.from,
      source: edge.source,
      hint: hintFor(edge)
    })
    if (!nodes.has(edge.to)) nodes.set(edge.to, { id: edge.to, kind: made.kinds.missing, title: edge.to, attrs: {} })
  }

  const merged = mergeEdges(edges)
  for (const conflict of merged.conflicts) {
    const { edge, key } = conflict
    diagnostics.push({
      rule: "link-conflict",
      severity: "warning",
      message: `${edge.from} -${edge.rel}-> ${edge.to}: ${key} is ${JSON.stringify(conflict.dropped.value)} here but ${
        JSON.stringify(conflict.kept.value)
      } at ${fmt(conflict.kept.source)}, which is kept`,
      node: edge.from,
      source: conflict.dropped.source,
      hint: `give ${key} one value in every declaration of this link, or declare it once`
    })
  }

  return {
    root: input.root,
    config: input.config,
    specs,
    specById,
    annotations,
    graph: new Graph(nodes.values(), merged.edges),
    diagnostics: sortDiagnostics(diagnostics),
    results: evidence?.results,
    types: input.types,
    steps: { files: (input.stepFiles ?? []).map((file) => file.path), definitions: stepDefinitions }
  }
}
annotate(buildProject, { is: "ARCH-graph-builder", "instance-of": ["PAT-derived-index", "PAT-pipes-and-filters"] })

/**
 * Where a node is in delivery: `verified` once all its scenarios pass, `failing` while any fails (a
 * regression is not work in progress), `in-progress` while automation is partial — otherwise its
 * declared maturity, while that is a level of the ladder. Implemented and unimplemented specs share
 * one format; evidence, not a status field, says which is which. A node with neither scenarios nor a
 * maturity has no stage.
 */
export const stageOf = (maturity: unknown, verification: Verification, ladder: Words): string | undefined =>
  verification === "passing"
    ? made.stages.verified
    : verification === "failing"
    ? made.stages.failing
    : verification === "partial"
    ? made.stages.inProgress
    : Predicate.isString(maturity) && ladder.includes(maturity)
    ? maturity
    : undefined

/** The line a key is written on; an entry of a map (`activity.test`) falls back to the map's own line. */
const lineOfKey = (lines: Readonly<Record<string, number>>, key: string): number | undefined => {
  const own = Object.hasOwn(lines, key) ? lines[key] : undefined
  const parent = key.split(".")[0]!
  return own ?? (Object.hasOwn(lines, parent) ? lines[parent] : undefined)
}

const compact = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined))

const fmt = (source: SourceRef | undefined) => source ? `${source.file}:${source.line}` : "?"
