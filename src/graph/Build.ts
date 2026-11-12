/**
 * Builds the whole-system graph from parsed sources. Files are the source of
 * truth; the graph is a derived, disposable index that can be rebuilt at any
 * time (and exported for grep/jq). Building is pure: no IO happens here.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import { type Attrs, Graph, type GraphEdge, type GraphNode, type SourceRef } from "../model/Graph.ts"
import { type RunResults, type StepStatus, type Verification, verificationOf } from "../model/Results.ts"
import { hasKind, hasRelation, isDerived, linkKeys, made, reservedRelations, type Words } from "../model/Vocabulary.ts"
import { type Annotation, codeNodeId, scanCode } from "../parse/Annotations.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import { linksOfKeys, parseFeatureSpec, parseMarkdownSpec, type Spec, writtenKind } from "../parse/Spec.ts"
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
  /** The records themselves, for the readers that may see all of them; a scenario that runs sees none. */
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
  /** The stored result records, for readers that see every result; `undefined` for a scenario that runs. */
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
      diagnostics.push(diagnostic("annotation-unreadable", {
        message: problem.message,
        source: { file: file.path, line: problem.line },
        hint: problem.hint ?? "write ids and attributes as literals, e.g. annotate(Graph, { is: \"ARCH-graph\" })"
      }))
    }
    for (const ignored of scan.ignored) {
      diagnostics.push(diagnostic("annotation-ignored", {
        message: `"${ignored.text}" follows code on the same line, so it is not read as an annotation`,
        source: { file: file.path, line: ignored.line },
        hint:
          "put it on a comment line of its own: directly above a declaration it binds to that declaration, followed by a blank line to the whole file"
      }))
    }
  }
  const stepDefinitions: Array<StepSignature> = []
  for (const file of input.stepFiles ?? []) {
    const scan = scanStepDefinitions(file.path, file.content)
    stepDefinitions.push(...scan.definitions)
    for (const problem of scan.problems) {
      diagnostics.push(diagnostic(problem.rule, {
        message: problem.message,
        source: { file: file.path, line: problem.line },
        hint: problem.rule === "step-expression"
          ? "fix the Cucumber Expression: {int}, {float}, {word}, {string} and {} are the parameters, and ( ) / { } \\ are escaped with a backslash"
          : "register each step with a statement of its own, `Given(\"…\", …)` with a literal expression, in a top-level `defineSteps(world, ({ Given }) => { … })`; until then context, snippets and `sdp steps` do not know it"
      }))
    }
  }

  const nodes = new Map<string, GraphNode>()
  const edges: Array<GraphEdge> = []
  const declare = (node: GraphNode) => {
    const existing = nodes.get(node.id)
    if (existing) {
      diagnostics.push(diagnostic("duplicate-id", {
        message: `id ${node.id} is already declared at ${fmt(existing.source)}`,
        node: node.id,
        source: node.source,
        hint: "ids must be unique across the workspace; rename one of them"
      }))
      return false
    }
    nodes.set(node.id, node)
    return true
  }
  /** An authored node's attributes without those sdp derives; each one written is reported where it is. */
  const authored = (id: string, kind: string, attrs: Attrs, at: (key: string) => SourceRef): Record<string, unknown> => {
    const kept: Array<readonly [string, unknown]> = []
    for (const [key, value] of Object.entries(attrs)) {
      if (!isDerived(kind, key)) {
        kept.push([key, value])
        continue
      }
      diagnostics.push(diagnostic("derived-attribute", {
        message: `${id}: ${key} is derived by sdp, so the value written here is ignored`,
        node: id,
        source: at(key),
        hint: `delete \`${key}\`; sdp computes it (\`sdp vocabulary\` lists what it derives)`
      }))
    }
    // Not assigned one by one: `__proto__` is a key like any other.
    return Object.fromEntries(kept)
  }
  /** What the scenarios of each spec say; a node without a spec of its own has none. */
  const verifications = new Map<string, Verification>()
  /** A node's attributes with its stage, which its maturity and its scenarios decide. */
  const staged = (id: string, attrs: Attrs) =>
    compact({ ...attrs, stage: stageOf(attrs.maturity, verifications.get(id) ?? "none", vocabulary.maturity) })

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
    if (!nodes.has(spec.id)) verifications.set(spec.id, verification)
    const openQuestions = spec.openQuestions.filter((q) => !q.resolved).length
    const at = (key: string): SourceRef => ({ file: spec.file, line: lineOfKey(spec.attrLines, key) ?? 1 })
    const attrs = authored(spec.id, spec.kind, spec.attrs, at)
    declare({
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      attrs: staged(spec.id, {
        ...attrs,
        file: spec.file,
        summary: spec.summary || undefined,
        scenarios: spec.scenarios.length,
        verification,
        openQuestions: openQuestions > 0 ? openQuestions : undefined
      }),
      source: { file: spec.file, line: 1 }
    })
    for (const inline of spec.inlineNodes) {
      const at = (key?: string): SourceRef => ({
        file: spec.file,
        line: (key === undefined ? undefined : lineOfKey(inline.attrLines, key)) ?? inline.line
      })
      const attrs = authored(inline.id, inline.kind, inline.attrs, at)
      declare({
        id: inline.id,
        kind: inline.kind,
        title: inline.title,
        attrs: staged(inline.id, { ...attrs, declaredIn: spec.id }),
        source: at()
      })
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
      const at = (): SourceRef => ({ file: annotation.file, line: annotation.line })
      const where = { file: annotation.file, owner: target, line: annotation.line }
      const kind = existing?.kind ?? writtenKind(rawKind, where, diagnostics) ?? vocabulary.kinds.anchored
      const attrs = authored(target, kind, rest, at)
      // A node a spec declares takes from code only the attributes the spec does not set.
      const added = existing ? Object.fromEntries(Object.entries(attrs).filter(([key]) => !Object.hasOwn(existing.attrs, key))) : attrs
      nodes.set(
        target,
        existing
          ? { ...existing, attrs: staged(target, { ...existing.attrs, ...added }) }
          : {
            id: target,
            kind,
            title: Predicate.isString(title) ? title : target,
            attrs: staged(target, { ...attrs, declaredIn: made.declaredInCode }),
            source: at()
          }
      )
      for (const link of linksOfKeys(added, vocabulary, where, diagnostics)) {
        edges.push({ from: target, rel: link.rel, to: link.to, attrs: link.attrs, source: at() })
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
  for (const spec of specs) {
    for (const ref of spec.references) {
      if (ref.rel === undefined || ref.id === spec.id) continue
      edges.push({ from: spec.id, rel: ref.rel, to: ref.id, source: { file: spec.file, line: ref.line } })
    }
  }

  // A link reads as an attribute of the node it starts from. So it cannot carry the name of a fact
  // sdp derives or checks, nor of an attribute that node has: either would pass for the other.
  const keys = linkKeys(vocabulary)
  const links = edges.filter((edge) => {
    const from = nodes.get(edge.from)
    const reserved = reservedRelations.includes(edge.rel)
    const written = from !== undefined && Object.hasOwn(from.attrs, edge.rel) && !keys.includes(edge.rel)
    if (!reserved && !written) return true
    diagnostics.push(diagnostic("link-syntax", {
      message: reserved
        ? `${edge.from} -${edge.rel}-> ${edge.to}: no link can be named ${edge.rel}, which sdp reads as an attribute of a node; the link is ignored`
        : `${edge.from} -${edge.rel}-> ${edge.to}: ${edge.rel} is already an attribute of ${edge.from}, so a link from it cannot have that name; the link is ignored`,
      node: edge.from,
      source: edge.source,
      hint: "give the relation another name: a link reads as an attribute of the node it starts from, so `[key=value]` must mean one thing"
    }))
    return false
  })

  // A prose mention is not a link: it adds an edge only between nodes no link joins.
  const joined = new Set(links.flatMap((edge) => [`${edge.from}\u0000${edge.to}`, `${edge.to}\u0000${edge.from}`]))
  for (const spec of specs) {
    for (const ref of spec.references) {
      if (ref.rel !== undefined || ref.id === spec.id || joined.has(`${spec.id}\u0000${ref.id}`)) continue
      links.push({ from: spec.id, rel: vocabulary.relations.mention, to: ref.id, source: { file: spec.file, line: ref.line } })
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
  for (const edge of links) {
    if (declaredIds.has(edge.to)) continue
    diagnostics.push(diagnostic("dangling-link", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: no node has id ${edge.to}`,
      node: edge.from,
      source: edge.source,
      hint: hintFor(edge)
    }))
    if (!nodes.has(edge.to)) nodes.set(edge.to, { id: edge.to, kind: made.kinds.missing, title: edge.to, attrs: {} })
  }

  const graph = new Graph(nodes.values(), links)
  for (const conflict of graph.conflicts) {
    const { edge, key } = conflict
    diagnostics.push(diagnostic("link-conflict", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: ${key} is ${JSON.stringify(conflict.dropped.value)} here but ${
        JSON.stringify(conflict.kept.value)
      } at ${fmt(conflict.kept.source)}, which is kept`,
      node: edge.from,
      source: conflict.dropped.source,
      hint: `give ${key} one value in every declaration of this link, or declare it once`
    }))
  }

  return {
    root: input.root,
    config: input.config,
    specs,
    specById,
    annotations,
    graph,
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
