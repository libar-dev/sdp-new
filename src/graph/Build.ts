/**
 * Builds the whole-system graph from parsed sources. Files are the source of
 * truth; the graph is a derived, disposable index that can be rebuilt at any
 * time (and exported for grep/jq). Building is pure: no IO happens here.
 * Besides what authors link, it derives which element imports which from the
 * code anchored to them.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import { type Attrs, formatSource, Graph, type GraphEdge, type GraphNode, type SourceRef } from "../model/Graph.ts"
import { type RunResults, type StepStatus, type Verification, verificationOf } from "../model/Results.ts"
import { activityRelation, hasKind, hasRelation, isDerived, linkKeys, made, reservedRelations, type Vocabulary, type Words } from "../model/Vocabulary.ts"
import { type Annotation, codeNodeId, scanCode } from "../parse/Annotations.ts"
import type { Import } from "../parse/Script.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import { parseFeatureSpec, type Spec, suiteId, writtenKind } from "../parse/Spec.ts"
import { scanStepDefinitions, type StepSignature } from "../parse/StepDefinitions.ts"

export interface SourceFile {
  readonly path: string
  readonly content: string
}

export interface ProjectInput {
  readonly root: string
  readonly config: Config
  readonly featureFiles: ReadonlyArray<SourceFile>
  /** The `.md` files beside the feature files and under the directories the features globs start in, by path: sdp reads none of them. */
  readonly markdownFiles: ReadonlyArray<string>
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
  for (const file of input.featureFiles) {
    const parsed = parseFeatureSpec(file.path, file.content, input.config)
    diagnostics.push(...parsed.diagnostics)
    if (parsed.spec) specs.push(parsed.spec)
  }
  // Markdown where specs live is a spec written out of habit, and in no graph, run or check. Beside
  // someone else's suites, named by their paths, it is their documentation.
  const specDirectories = new Set(specs.filter((spec) => spec.id !== suiteId(spec.file)).map((spec) => directoryOf(spec.file)))
  const suiteDirectories = new Set(specs.map((spec) => directoryOf(spec.file)).filter((directory) => !specDirectories.has(directory)))
  for (const file of input.markdownFiles.filter((file) => !suiteDirectories.has(directoryOf(file)))) {
    diagnostics.push(diagnostic("not-a-spec", {
      message: `${file} is Markdown, which sdp does not read: nothing written in it is in the graph`,
      source: { file, line: 1 },
      hint: `a spec is a feature file: write ${file.replace(/\.md$/, ".feature")}, its tags (@id=…) above \`Feature:\` (\`sdp new\` writes one); Markdown is for README.md and AGENTS.md`
    }))
  }
  const annotations: Array<Annotation> = []
  const importsOf = new Map<string, ReadonlyArray<Import>>()
  for (const file of input.codeFiles) {
    const scan = scanCode(file.path, file.content, vocabulary.relations.anchor)
    annotations.push(...scan.annotations)
    if (scan.imports.length > 0) importsOf.set(file.path, scan.imports)
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
          : "register each step with a statement of its own, `Given(\"…\", …)` with a literal expression, in `export default defineSteps(world, ({ Given }) => { … })`; until then context, snippets and `sdp steps` do not know it"
      }))
    }
  }

  const nodes = new Map<string, GraphNode>()
  const edges: Array<GraphEdge> = []
  const madeRelations: ReadonlyArray<string> = Object.values(made.relations)
  /** A link an author wrote. One named like a relation sdp makes would pass for it: it is reported where it is written, and dropped. */
  const written = (edge: GraphEdge) => {
    if (!madeRelations.includes(edge.rel)) return edges.push(edge)
    diagnostics.push(diagnostic("derived-attribute", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: sdp makes the ${edge.rel} links itself, so the link written here is ignored`,
      node: edge.from,
      source: edge.source,
      hint: "delete it; `sdp vocabulary` lists the relations sdp makes"
    }))
  }
  const declare = (node: GraphNode) => {
    const existing = nodes.get(node.id)
    if (existing) {
      diagnostics.push(diagnostic("duplicate-id", {
        message: `id ${node.id} is already declared at ${formatSource(existing.source) || "?"}`,
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
        hint: `delete it: sdp computes ${key} (\`sdp vocabulary\` lists what it derives)`
      }))
    }
    // Not assigned one by one: `__proto__` is a key like any other.
    return Object.fromEntries(kept)
  }
  /** What the scenarios of each spec say; a node without a spec of its own has none. */
  const verifications = new Map<string, Verification>()
  /**
   * A node's attributes with its stage, which its maturity and its scenarios decide. A milestone
   * has none: its scenarios are a gate, and a gate that is not met yet is no failing work.
   */
  const staged = (id: string, kind: string, attrs: Attrs) =>
    hasKind(vocabulary, "milestone", kind)
      ? attrs
      : compact({ ...attrs, stage: stageOf(attrs.maturity, verifications.get(id) ?? "none", vocabulary.maturity) })

  const evidence = input.evidence?.(specs)
  const unrun: Settled = { status: undefined, stale: undefined, lastRun: undefined }

  const specById = new Map<string, Spec>()
  for (const spec of specs) {
    if (!specById.has(spec.id)) specById.set(spec.id, spec)
    const statuses = new Map<string, StepStatus | undefined>()
    for (const scenario of spec.scenarios) {
      const { lastRun, stale, status } = evidence?.settle(scenario) ?? unrun
      statuses.set(scenario.id, status)
      const at = (key: string): SourceRef => ({ file: spec.file, line: scenario.attrLines[key] ?? scenario.line })
      declare({
        id: scenario.id,
        kind: made.kinds.scenario,
        title: scenario.name,
        attrs: compact({
          ...authored(scenario.id, made.kinds.scenario, scenario.attrs, at),
          spec: spec.id,
          keyword: scenario.keyword,
          tags: scenario.tags.length > 0 ? scenario.tags : undefined,
          description: scenario.description,
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
      // A scenario verifies its spec, and the rule it is an example of.
      for (const verified of [spec.id, ...(scenario.rule === undefined ? [] : [scenario.rule])]) {
        edges.push({ from: scenario.id, rel: vocabulary.relations.scenario, to: verified, source: { file: spec.file, line: scenario.line } })
      }
    }
    // A rule is a node from the day it is written: what must hold, why, and what its examples show so far.
    for (const rule of spec.rules) {
      const examples = spec.scenarios.filter((scenario) => scenario.rule === rule.id)
      const at = (key: string): SourceRef => ({ file: spec.file, line: rule.attrLines[key] ?? rule.line })
      declare({
        id: rule.id,
        kind: made.kinds.rule,
        title: rule.name,
        attrs: compact({
          ...authored(rule.id, made.kinds.rule, rule.attrs, at),
          spec: spec.id,
          description: rule.description,
          tags: rule.tags.length > 0 ? rule.tags : undefined,
          scenarios: examples.length,
          verification: verificationOf(examples.map((scenario) => statuses.get(scenario.id)))
        }),
        source: { file: spec.file, line: rule.line }
      })
      edges.push({ from: rule.id, rel: made.relations.rule, to: spec.id, source: { file: spec.file, line: rule.line } })
    }
    const verification: Verification = verificationOf([...statuses.values()])
    if (!nodes.has(spec.id)) verifications.set(spec.id, verification)
    const openQuestions = spec.openQuestions.length
    const at = (key: string): SourceRef => ({ file: spec.file, line: spec.attrLines[key] ?? 1 })
    const attrs = authored(spec.id, spec.kind, spec.attrs, at)
    declare({
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      attrs: staged(spec.id, spec.kind, compact({
        ...attrs,
        file: spec.file,
        summary: spec.summary || undefined,
        scenarios: spec.scenarios.length,
        verification,
        openQuestions: openQuestions > 0 ? openQuestions : undefined
      })),
      source: { file: spec.file, line: 1 }
    })
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
      const { attrs, links } = codeLinks(authored(target, kind, rest, at), vocabulary, where, diagnostics)
      // A node a spec declares takes from code only the attributes the spec does not set.
      const added = existing ? Object.fromEntries(Object.entries(attrs).filter(([key]) => !Object.hasOwn(existing.attrs, key))) : attrs
      nodes.set(
        target,
        existing
          ? { ...existing, attrs: staged(target, kind, { ...existing.attrs, ...added }) }
          : { id: target, kind, title: Predicate.isString(title) ? title : target, attrs: staged(target, kind, attrs), source: at() }
      )
      for (const link of links) edges.push({ from: target, rel: link.rel, to: link.to, source: at() })
    }
  }

  // A tag `@rel:ID` links the Feature, the Rule or the Scenario it sits on.
  for (const spec of specs) {
    for (const { id, links } of [{ id: spec.id, links: spec.links }, ...spec.rules, ...spec.scenarios]) {
      for (const link of links) written({ from: id, rel: link.rel, to: link.to, source: { file: spec.file, line: link.line } })
    }
  }
  for (const annotation of annotations) {
    const from = codeNodeId(annotation)
    const { kind: _k, title: _t, ...attrs } = annotation.attrs
    for (const to of annotation.targets) {
      written({
        from,
        rel: annotation.rel,
        to,
        attrs: annotation.rel === vocabulary.relations.anchor || Object.keys(attrs).length === 0 ? undefined : attrs,
        source: { file: annotation.file, line: annotation.line }
      })
    }
  }

  // A link reads as an attribute of the node it starts from. So it cannot carry the name of a fact
  // sdp derives or checks, nor of an attribute that node has: either would pass for the other.
  const links = edges.filter((edge) => {
    const from = nodes.get(edge.from)
    const reserved = reservedRelations.includes(edge.rel)
    const written = from !== undefined && Object.hasOwn(from.attrs, edge.rel)
    if (!reserved && !written) return true
    diagnostics.push(diagnostic("link-syntax", {
      message: reserved
        ? `${edge.from} -${edge.rel}-> ${edge.to}: no link can be named ${edge.rel}, which sdp reads as an attribute of a node; the link is ignored`
        : `${edge.from} -${edge.rel}-> ${edge.to}: ${edge.rel} is already an attribute of ${edge.from}, so a link from it cannot have that name; the link is ignored`,
      node: edge.from,
      source: edge.source,
      hint: reserved
        ? `${edge.rel} is a value, written with =: @${edge.rel}=${edge.to}`
        : "give the relation another name: a link reads as an attribute of the node it starts from, so `[key=value]` must mean one thing"
    }))
    return false
  })

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
      : hasRelation(vocabulary, "closes", edge.rel)
      ? { what: "phase or iteration", ids: [...phases, ...iterations] }
      : undefined
    return known && known.ids.length > 0
      ? `use one of the declared ${known.what} ids: ${known.ids.join(", ")}`
      : `write the spec \`@id=${edge.to}\` (\`sdp new <kind> "<title>" --id ${edge.to}\`), or fix the reference`
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

  const graph = new Graph(nodes.values(), [...links, ...importsBetweenElements(annotations, importsOf, nodes, vocabulary)])
  for (const conflict of graph.conflicts) {
    const { edge, key } = conflict
    diagnostics.push(diagnostic("link-conflict", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: ${key} is ${JSON.stringify(conflict.dropped.value)} here but ${
        JSON.stringify(conflict.kept.value)
      } at ${formatSource(conflict.kept.source) || "?"}, which is kept`,
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
annotate(buildProject, { is: "ARCH-graph-builder" })

/**
 * `A -imports-> B` for each module anchored to element A that imports a function, a class or a
 * constant from a module anchored to element B, at the line that names the module: the
 * dependencies between elements as the code has them. An import of types alone calls nothing, and
 * no element imports itself.
 */
const importsBetweenElements = (
  annotations: ReadonlyArray<Annotation>,
  importsOf: ReadonlyMap<string, ReadonlyArray<Import>>,
  nodes: ReadonlyMap<string, GraphNode>,
  vocabulary: Vocabulary
): ReadonlyArray<GraphEdge> => {
  const elementsOf = new Map<string, Set<string>>()
  for (const annotation of annotations.filter((a) => a.rel === vocabulary.relations.anchor)) {
    const elements = annotation.targets.filter((id) => hasKind(vocabulary, "architectural", nodes.get(id)?.kind ?? ""))
    if (elements.length > 0) elementsOf.set(annotation.file, new Set([...elementsOf.get(annotation.file) ?? [], ...elements]))
  }
  const modules = new Set(elementsOf.keys())
  const edges: Array<GraphEdge> = []
  for (const [file, elements] of elementsOf) {
    for (const { line, specifier } of importsOf.get(file) ?? []) {
      const module = resolveModule(file, specifier, modules)
      for (const used of module === undefined ? [] : elementsOf.get(module)!) {
        for (const element of elements) {
          if (element !== used) edges.push({ from: element, rel: made.relations.imports, to: used, source: { file, line } })
        }
      }
    }
  }
  return edges
}

const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]

/**
 * The module of `modules` that a relative specifier written in `file` names, as TypeScript resolves
 * it: the file as written, the source of a `.js` name, the name with an extension, or a directory's
 * index. A package name names no module of the workspace.
 */
const resolveModule = (file: string, specifier: string, modules: ReadonlySet<string>): string | undefined => {
  if (!/^\.\.?(\/|$)/.test(specifier)) return undefined
  const parts: Array<string> = []
  for (const part of [...directoryOf(file).split("/"), ...specifier.split("/")]) {
    if (part === "" || part === ".") continue
    if (part !== "..") parts.push(part)
    else if (parts.pop() === undefined) return undefined
  }
  const path = parts.join("/")
  const candidates = [
    path,
    path.replace(/\.([cm]?)js(x?)$/, ".$1ts$2"),
    ...extensions.map((extension) => `${path}${extension}`),
    ...extensions.map((extension) => `${path}/index${extension}`)
  ]
  return candidates.find((candidate) => modules.has(candidate))
}

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

/**
 * What a code annotation declares a node with, split into values and links: the keys the vocabulary
 * names as links — the plan, phase and closing relations, and each discipline under `activity` —
 * link to the ids they hold. A value there that is not an id is an error at the annotation.
 */
const codeLinks = (
  declared: Attrs,
  vocabulary: Vocabulary,
  at: { readonly file: string; readonly owner: string; readonly line: number },
  diagnostics: Array<Diagnostic>
) => {
  const keys = linkKeys(vocabulary)
  const activity = vocabulary.attributes.activity
  const links: Array<{ readonly rel: string; readonly to: string }> = []
  const add = (rel: string, value: unknown) => {
    for (const to of [value].flat()) {
      if (Predicate.isString(to) || Predicate.isNumber(to)) {
        links.push({ rel, to: String(to) })
        continue
      }
      diagnostics.push(diagnostic("link-syntax", {
        message: `${at.owner}: ${rel} ${JSON.stringify(to)} names no id`,
        node: at.owner,
        source: { file: at.file, line: at.line },
        hint: `write the id it links to, e.g. ${rel}: "IT-beta"`
      }))
    }
  }
  const values = Object.entries(declared).filter(([key, value]) => {
    if (keys.includes(key)) add(key, value)
    else if (key === activity && Predicate.isObject(value) && !Array.isArray(value)) {
      for (const [discipline, iteration] of Object.entries(value)) add(activityRelation(vocabulary, discipline), iteration)
    } else return true
    return false
  })
  // Not assigned one by one: `__proto__` is a key like any other.
  return { attrs: Object.fromEntries(values), links }
}

const directoryOf = (file: string) => file.slice(0, Math.max(0, file.lastIndexOf("/")))

const compact = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined))
