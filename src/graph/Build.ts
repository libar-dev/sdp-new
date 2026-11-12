/**
 * Builds the whole-system graph from parsed sources. Files are the source of
 * truth; the graph is a derived, disposable index that can be rebuilt at any
 * time (and exported for grep/jq). Building is pure: no IO happens here.
 * Besides what authors link, it derives which element imports which from the
 * code anchored to them.
 */
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import { type Attrs, formatSource, Graph, type GraphEdge, type GraphNode, type SourceRef } from "../model/Graph.ts"
import { notPassing, type RunResults, type StepStatus, verificationOf } from "../model/Results.ts"
import {
  activityRelation,
  attribute,
  hasKind,
  hasRelation,
  isDerived,
  isToCome,
  linkKeys,
  made,
  reservedRelations,
  type Vocabulary
} from "../model/Vocabulary.ts"
import { type Annotation, codeNodeId, scanCode } from "../parse/Annotations.ts"
import type { Import } from "../parse/Script.ts"
import type { Rule, Scenario } from "../parse/Gherkin.ts"
import { parseFeatureSpec, prefixKind, type Spec, suiteId, writtenKind } from "../parse/Spec.ts"
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
  /** The configuration that says what the names code imports mean: the files of `moduleConfigFiles` and what they extend (`extendedBy`). */
  readonly moduleConfigs?: ReadonlyArray<SourceFile> | undefined
  /** The step definition files: their definitions are read statically, never run. */
  readonly stepFiles?: ReadonlyArray<SourceFile> | undefined
  /** What the stored results say about the parsed specs' scenarios; without it the graph shows no results. */
  readonly evidence?: ((specs: ReadonlyArray<Spec>) => EvidenceView) | undefined
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
  readonly steps: ProjectSteps
}

/**
 * Builds the whole-system graph from parsed sources — specs, annotations and stored results — without any IO.
 *
 * @sdp is ARCH-graph-builder
 */
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
  const typesOf = new Map<string, ReadonlySet<string>>()
  for (const file of input.codeFiles) {
    const scan = scanCode(file.path, file.content, vocabulary.relations.anchor)
    annotations.push(...scan.annotations)
    if (scan.imports.length > 0) importsOf.set(file.path, scan.imports)
    if (scan.types.size > 0) typesOf.set(file.path, scan.types)
    for (const { hint, line, message } of scan.unreadable) {
      diagnostics.push(diagnostic("annotation-unreadable", { message, source: { file: file.path, line }, hint }))
    }
    for (const { hint, line, message } of scan.ignored) {
      diagnostics.push(diagnostic("annotation-ignored", { message, source: { file: file.path, line }, hint }))
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
  /** What the examples that verify each spec did; a node without a spec of its own has none. */
  const verifications = new Map<string, ReadonlyArray<StepStatus | undefined>>()
  /**
   * A node's attributes with its stage, which its maturity and its scenarios decide, and whether it
   * is work still to come. A milestone has no stage: its scenarios are a gate, and a gate that is
   * not met yet is no failing work. Both are derived anew, so that what they were for another kind,
   * before an anchor wrote the node's kind, is not kept.
   */
  const staged = (id: string, kind: string, attrs: Attrs) => {
    const toCome = isToCome(attrs.maturity)
    const marked = compact({ ...attrs, stage: undefined, toCome: toCome || undefined })
    return hasKind(vocabulary, "milestone", kind)
      ? marked
      : compact({ ...marked, stage: stageOf(attrs.maturity, verifications.get(id) ?? [], toCome) })
  }

  const evidence = input.evidence?.(specs)
  const unrun: Settled = { status: undefined, stale: undefined, lastRun: undefined }

  const specById = new Map<string, Spec>()
  for (const spec of specs) {
    if (!specById.has(spec.id)) specById.set(spec.id, spec)
    const statuses = new Map<string, StepStatus | undefined>()
    const work = workOf(spec)
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
          hash: scenario.hash,
          toCome: work.example(scenario) || undefined
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
      const done = examples.map((scenario) => statuses.get(scenario.id))
      const { maturity, toCome } = work.rule(rule)
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
          verification: verificationOf(done),
          stage: stageOf(maturity, done, toCome),
          toCome: toCome || undefined
        }),
        source: { file: spec.file, line: rule.line }
      })
      edges.push({ from: rule.id, rel: made.relations.rule, to: spec.id, source: { file: spec.file, line: rule.line } })
    }
    // Work still to come is verified by all its examples; live work by those of its live rules, so
    // that a rule still to come neither fails it nor makes it verified, and a live rule without an
    // example yet counts as one that has not run.
    const bare = spec.rules.filter((rule) => !work.rule(rule).toCome && !spec.scenarios.some((scenario) => scenario.rule === rule.id))
    const counted = [
      ...spec.scenarios.filter((scenario) => work.spec || !work.example(scenario)).map((scenario) => statuses.get(scenario.id)),
      ...(work.spec ? [] : bare.map(() => undefined))
    ]
    if (!nodes.has(spec.id)) verifications.set(spec.id, counted)
    const rulesToCome = spec.rules.filter((rule) => work.rule(rule).toCome).length
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
        verification: verificationOf(counted),
        openQuestions: openQuestions > 0 ? openQuestions : undefined,
        rulesToCome: rulesToCome > 0 ? rulesToCome : undefined
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
        attrs: compact({ file: annotation.file, symbol: annotation.symbol, doc: annotation.doc, shape: annotation.shape, exports: annotation.exports }),
        source: { file: annotation.file, line: annotation.symbolLine }
      })
    }
  }
  // Every anchor declares the node it names, in the order of their files: the kind it writes or its
  // id's prefix names, a title and attributes. What a spec, or else an earlier anchor, gives holds;
  // a value given differently is reported where it is written.
  const declaredBy = new Map<string, Map<string, SourceRef>>()
  // The kind sdp gives an anchored node that names none is no kind it declares: one written later replaces it.
  const unnamedKind = new Set<string>()
  for (const annotation of annotations.filter((a) => a.rel === vocabulary.relations.anchor)) {
    for (const target of annotation.targets) {
      const existing = nodes.get(target)
      const { kind: rawKind, title, ...rest } = annotation.attrs
      const at: SourceRef = { file: annotation.file, line: annotation.line }
      const where = { file: annotation.file, owner: target, line: annotation.line }
      const declaredKind = writtenKind(rawKind, where, diagnostics) ?? prefixKind(target, input.config)
      const named = existing !== undefined && unnamedKind.has(target) ? declaredKind : undefined
      const kind = named ?? existing?.kind ?? declaredKind ?? vocabulary.kinds.anchored
      if (existing === undefined && declaredKind === undefined) unnamedKind.add(target)
      if (named !== undefined) unnamedKind.delete(target)
      const { attrs, links } = codeLinks(authored(target, kind, rest, () => at), vocabulary, where, diagnostics)
      const declared: Array<readonly [string, unknown]> = [
        ...(declaredKind === undefined ? [] : [["kind", declaredKind] as const]),
        ...(Predicate.isString(title) ? [["title", title] as const] : []),
        ...Object.entries(attrs)
      ]
      let sources = declaredBy.get(target)
      if (sources === undefined) {
        sources = new Map()
        declaredBy.set(target, sources)
        // What a spec declares, at the line it is written.
        const spec = existing && specById.get(target)
        for (const key of spec ? ["kind", "title", ...Object.keys(spec.attrs)] : []) {
          sources.set(key, { file: spec!.file, line: spec!.attrLines[key] ?? 1 })
        }
      }
      if (existing === undefined) {
        nodes.set(target, { id: target, kind, title: Predicate.isString(title) ? title : target, attrs: staged(target, kind, attrs), source: at })
      } else {
        // A title that only repeats the id was given by no one.
        const given = (key: string): unknown =>
          key === "kind"
            ? (named === undefined && !unnamedKind.has(target) ? existing.kind : undefined)
            : key === "title"
            ? (existing.title === target ? undefined : existing.title)
            : attribute(existing, key)
        for (const [key, value] of declared) {
          const kept = given(key)
          if (kept === undefined || JSON.stringify(kept) === JSON.stringify(value)) continue
          const first = sources.get(key) ?? existing.source
          diagnostics.push(diagnostic("declaration-conflict", {
            message: `${target}: ${key} is ${JSON.stringify(value)} here but ${JSON.stringify(kept)} at ${formatSource(first) || "?"}, which is kept`,
            node: target,
            source: at,
            hint: `give ${key} one value wherever ${target} is declared, or declare it in one place`
          }))
        }
        const added = Object.fromEntries(Object.entries(attrs).filter(([key]) => !Object.hasOwn(existing.attrs, key)))
        const titled = Predicate.isString(title) && given("title") === undefined ? { title } : {}
        nodes.set(target, { ...existing, kind, ...titled, attrs: staged(target, kind, { ...existing.attrs, ...added }) })
      }
      for (const [key] of declared) if (!sources.has(key)) sources.set(key, at)
      for (const link of links) edges.push({ from: target, rel: link.rel, to: link.to, source: at })
    }
  }

  // A tag `@rel:ID` links the Feature, the Rule or the Scenario it sits on.
  for (const spec of specs) {
    for (const { id, links } of [{ id: spec.id, links: spec.links }, ...spec.rules, ...spec.scenarios]) {
      for (const link of links) written({ from: id, rel: link.rel, to: link.to, source: { file: spec.file, line: link.line } })
    }
  }
  for (const annotation of annotations) {
    const source = { file: annotation.file, line: annotation.line }
    for (const to of annotation.targets) written({ from: codeNodeId(annotation), rel: annotation.rel, to, source })
    // A key=value describes the node a tag declares; a link has none to describe.
    const values = Object.entries(annotation.attrs)
    if (annotation.rel === vocabulary.relations.anchor || values.length === 0) continue
    const said = values.map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`).join(" ")
    diagnostics.push(diagnostic("annotation-ignored", {
      message: `${said} describes no node: a link has no attributes`,
      source,
      hint: `delete it, or say it in the comment that describes the code; on an \`@sdp ${vocabulary.relations.anchor}\` tag it describes the node the tag declares`
    }))
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
  // `missing` node, so it can be queried and fixed. An element or a pattern that only work still to
  // come names is still to come too: a node of the kind its id's prefix names, with no place in the
  // files, until the work is built and its code must declare it.
  const declaredIds = new Set(nodes.keys())
  const architectural = (id: string) => hasKind(vocabulary, "architectural", prefixKind(id, input.config) ?? "")
  const namedToCome = (edge: GraphEdge) => nodes.get(edge.from)?.attrs.toCome === true && architectural(edge.to)
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
  // Live work may name what it replaced in the change that deletes it: what the link names is the
  // base's, which the comparison with the base reads from the specs, and the graph has no node of it.
  const replacedBefore = (edge: GraphEdge) =>
    hasRelation(vocabulary, "replaces", edge.rel) && nodes.get(edge.from)?.attrs.toCome !== true && !declaredIds.has(edge.to)
  const present = links.filter((edge) => !replacedBefore(edge))
  for (const edge of present) {
    if (declaredIds.has(edge.to)) continue
    if (namedToCome(edge)) {
      const named = nodes.get(edge.to)
      if (named === undefined || named.kind === made.kinds.missing) {
        nodes.set(edge.to, { id: edge.to, kind: prefixKind(edge.to, input.config)!, title: edge.to, attrs: {} })
      }
      continue
    }
    diagnostics.push(diagnostic("dangling-link", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: no node has id ${edge.to}`,
      node: edge.from,
      source: edge.source,
      hint: hintFor(edge)
    }))
    if (!nodes.has(edge.to)) nodes.set(edge.to, { id: edge.to, kind: made.kinds.missing, title: edge.to, attrs: {} })
  }

  const resolve = moduleResolver(input.moduleConfigs ?? [], new Set(input.codeFiles.map((file) => file.path)), diagnostics)
  const graph = new Graph(nodes.values(), [...present, ...importsBetweenElements(annotations, importsOf, typesOf, resolve, nodes, vocabulary)])

  return {
    root: input.root,
    config: input.config,
    specs,
    specById,
    annotations,
    graph,
    diagnostics: sortDiagnostics(diagnostics),
    results: evidence?.results,
    steps: { files: (input.stepFiles ?? []).map((file) => file.path), definitions: stepDefinitions }
  }
}

/**
 * `A -imports-> B` for each module anchored to element A that imports a function, a class or a
 * constant from a module anchored to element B, at the line that names the module: the
 * dependencies between elements as the code has them. An import of types alone calls nothing —
 * written with `type`, or of names the module exports as types alone — and no element imports
 * itself. A name means the code file TypeScript resolves it to (`moduleResolver`), whether or not
 * that file anchors an element. A pattern imports nothing and nothing imports it: the code that
 * plays it is part of an element.
 */
const importsBetweenElements = (
  annotations: ReadonlyArray<Annotation>,
  importsOf: ReadonlyMap<string, ReadonlyArray<Import>>,
  typesOf: ReadonlyMap<string, ReadonlySet<string>>,
  resolve: ModuleResolver,
  nodes: ReadonlyMap<string, GraphNode>,
  vocabulary: Vocabulary
): ReadonlyArray<GraphEdge> => {
  const elementsOf = new Map<string, Set<string>>()
  for (const annotation of annotations.filter((a) => a.rel === vocabulary.relations.anchor)) {
    const elements = annotation.targets.filter((id) => {
      const kind = nodes.get(id)?.kind ?? ""
      return hasKind(vocabulary, "architectural", kind) && !hasKind(vocabulary, "pattern", kind)
    })
    if (elements.length > 0) elementsOf.set(annotation.file, new Set([...elementsOf.get(annotation.file) ?? [], ...elements]))
  }
  const edges: Array<GraphEdge> = []
  for (const [file, elements] of elementsOf) {
    for (const { line, names, specifier } of importsOf.get(file) ?? []) {
      const module = resolve(file, specifier, line)
      const types = module === undefined ? undefined : typesOf.get(module)
      if (names !== undefined && names.length > 0 && names.every((name) => types?.has(name))) continue
      for (const used of module === undefined ? [] : elementsOf.get(module) ?? []) {
        for (const element of elements) {
          if (element !== used) edges.push({ from: element, rel: made.relations.imports, to: used, source: { file, line } })
        }
      }
    }
  }
  return edges
}

/**
 * The extensions TypeScript tries in its order, the TypeScript source before the JavaScript: added to
 * a name, then in place of each extension a name is written with. Declaration files are left out, as
 * they hold no code.
 */
const addedExtensions = [".ts", ".tsx", ".js", ".jsx"]
const swappedExtensions = new Map<string, ReadonlyArray<string>>([
  [".ts", addedExtensions],
  [".js", addedExtensions],
  [".tsx", [".tsx", ".ts", ".jsx", ".js"]],
  [".jsx", [".tsx", ".ts", ".jsx", ".js"]],
  [".mts", [".mts", ".mjs"]],
  [".mjs", [".mts", ".mjs"]],
  [".cts", [".cts", ".cjs"]],
  [".cjs", [".cts", ".cjs"]]
])

/** The code file of the workspace a name that `file` imports at `line` means, if any. */
type ModuleResolver = (file: string, specifier: string, line: number) => string | undefined

const tsconfigFile = "tsconfig.json"
const packageFile = "package.json"

/** The conditions of `exports` and `imports` TypeScript resolves by, whatever kind of module imports. */
const conditions: ReadonlySet<string> = new Set(["types", "import", "require", "node", "default"])

/**
 * The configuration files that may say what a name code imports means: the `tsconfig.json` and the
 * `package.json` of each directory that holds code, and of every directory above it in the
 * workspace. What a `tsconfig.json` extends is found from it (`extendedBy`).
 */
export const moduleConfigFiles = (code: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(code.flatMap((file) => upFrom(directoryOf(file))))].flatMap((directory) => [tsconfigFile, packageFile].map((name) => joinPath(directory, name)))

/** Where each configuration a `tsconfig.json` extends may be, nearest first; a `package.json` extends none. */
export const extendedBy = (file: SourceFile): ReadonlyArray<string> => {
  const read = baseName(file.path) === packageFile ? undefined : readJson(file.content)
  const config = read !== undefined && "value" in read ? read.value : undefined
  return Predicate.isObject(config) ? [config.extends].flat().filter(Predicate.isString).flatMap((base) => extendsCandidates(file.path, base)) : []
}

/**
 * What the names code imports mean, as TypeScript resolves them with the workspace's configuration:
 * a relative name the file it names; any other the file the `paths` of the nearest `tsconfig.json`
 * map it to — the configurations it extends included, relative to `baseUrl` when one is set — or the
 * file it names under that `baseUrl`; a `#` name the file the `imports` of the nearest `package.json`
 * map it to; and a package of the workspace — one whose `package.json` is among `configs` — the file
 * its `exports` map the name to, else its `types` or its `main`, else its index. Each is a code file
 * of the workspace or none: a name that means none is a library's. What sdp cannot follow, though it
 * could name the workspace's code, is reported where it is written.
 */
const moduleResolver = (configs: ReadonlyArray<SourceFile>, files: ReadonlySet<string>, diagnostics: Array<Diagnostic>): ModuleResolver => {
  const byPath = new Map(configs.map((file) => [file.path, file]))
  const reported = new Set<string>()
  const report = (source: SourceRef, message: string, hint: string) => {
    if (reported.has(`${formatSource(source)} ${message}`)) return
    reported.add(`${formatSource(source)} ${message}`)
    diagnostics.push(diagnostic("import-unresolved", { message, source, hint }))
  }
  const parsed = new Map<string, Readonly<Record<string, unknown>> | undefined>()
  /** A configuration as an object; one that does not parse names nothing, and is reported. */
  const json = (path: string) => {
    if (parsed.has(path)) return parsed.get(path)
    const read = readJson(byPath.get(path)?.content ?? "{}")
    if ("error" in read) report({ file: path, line: 1 }, `${path} does not parse, so the names it maps are not resolved: ${read.error}`, "fix its syntax")
    const value = "value" in read && Predicate.isObject(read.value) ? read.value : undefined
    parsed.set(path, value)
    return value
  }

  /** The code file a path names, as TypeScript completes a name: the file, or else the directory's index. */
  const fileAt = (path: string, directory: boolean): string | undefined => {
    const indexes = addedExtensions.map((extension) => joinPath(path, `index${extension}`))
    if (directory) return indexes.find((candidate) => files.has(candidate))
    const written = /\.[^./]*$/.exec(path)?.[0]
    const stem = path.slice(0, path.length - (written?.length ?? 0))
    const candidates = [
      ...written === undefined ? [] : swappedExtensions.get(written)?.map((extension) => `${stem}${extension}`) ?? [path],
      ...addedExtensions.map((extension) => `${path}${extension}`),
      ...indexes
    ]
    return candidates.find((candidate) => files.has(candidate))
  }

  /** What a `tsconfig.json`, with what it extends, says of names: the setting nearest the code holds. */
  interface Options {
    readonly baseUrl?: string
    readonly paths?: Readonly<Record<string, unknown>>
    /** Where `paths` maps from without a `baseUrl`: the directory of the configuration that sets them. */
    readonly pathsFrom?: string
  }
  const options = (path: string, configDir: string, seen: ReadonlySet<string>): Options => {
    const config = json(path)
    if (config === undefined || seen.has(path)) return {}
    const inherited = [config.extends].flat().filter(Predicate.isString).reduce<Options>((merged, base) => {
      const found = extendsCandidates(path, base).find((candidate) => byPath.has(candidate))
      if (found !== undefined) return { ...merged, ...options(found, configDir, new Set([...seen, path])) }
      const line = (byPath.get(path)?.content.split(/\r?\n/).findIndex((text) => text.includes(`"${base}"`)) ?? 0) + 1
      report(
        { file: path, line: Math.max(line, 1) },
        `${path} extends ${base}, which is neither in the workspace nor installed, so the names it maps are not resolved`,
        "install what it extends, or write the path of a configuration in the workspace"
      )
      return merged
    }, {})
    const own = Predicate.isObject(config.compilerOptions) ? config.compilerOptions : {}
    const at = (value: string) => value.startsWith("${configDir}") ? joinPath(configDir, value.slice(12)) : joinPath(directoryOf(path), value)
    return {
      ...inherited,
      ...Predicate.isString(own.baseUrl) ? { baseUrl: at(own.baseUrl) } : {},
      ...Predicate.isObject(own.paths) ? { paths: own.paths, pathsFrom: directoryOf(path) } : {}
    }
  }
  const governing = new Map<string, Options & { readonly configDir: string }>()
  /** The options of the `tsconfig.json` nearest a directory, at it or above it. */
  const optionsFor = (directory: string) => {
    const known = governing.get(directory)
    if (known !== undefined) return known
    const nearest = upFrom(directory).map((above) => joinPath(above, tsconfigFile)).find((path) => byPath.has(path))
    const found = nearest === undefined ? { configDir: "" } : { ...options(nearest, directoryOf(nearest), new Set()), configDir: directoryOf(nearest) }
    governing.set(directory, found)
    return found
  }

  /** What a map of names — `exports`, `imports` — gives `name`: through the conditions TypeScript knows, the first of a list that gives one. */
  const mapped = (map: Readonly<Record<string, unknown>>, name: string, manifest: string, at: SourceRef & { readonly specifier: string }): string | undefined => {
    const key = matchKey(Object.keys(map), name)
    const target = (value: unknown): string | undefined => {
      if (Predicate.isString(value)) return value.replaceAll("*", key!.star)
      if (Array.isArray(value)) return value.map(target).find(Predicate.isString)
      if (!Predicate.isObject(value)) return undefined
      const known = Object.keys(value).filter((condition) => conditions.has(condition))
      if (known.length === 0) {
        report(
          { file: at.file, line: at.line },
          `"${at.specifier}" is mapped by ${manifest} only under the conditions ${Object.keys(value).join(", ")}, which TypeScript does not resolve by, so it is not resolved`,
          `add a "types" or a "default" condition to ${manifest}`
        )
      }
      return known.map((condition) => target(value[condition])).find(Predicate.isString)
    }
    return key === undefined ? undefined : target(map[key.key])
  }

  let packages: ReadonlyMap<string, ReadonlyArray<string>> | undefined
  /** The packages of the workspace by name: the directories of the configuration's `package.json` outside any node_modules. */
  const workspacePackages = () => {
    if (packages !== undefined) return packages
    const named = new Map<string, Array<string>>()
    for (const path of byPath.keys()) {
      if (baseName(path) !== packageFile || path.split("/").includes("node_modules")) continue
      const name = json(path)?.name
      if (Predicate.isString(name)) named.set(name, [...named.get(name) ?? [], directoryOf(path)])
    }
    packages = named
    return named
  }
  const packageExport = (file: string, specifier: string, line: number): string | undefined => {
    const { name, subpath } = packageName(specifier)
    const directories = workspacePackages().get(name) ?? []
    if (directories.length > 1) {
      report({ file, line }, `"${specifier}" names ${directories.length} packages of the workspace, in ${directories.map((directory) => directory || ".").join(" and ")}, so it is not resolved`, "give each package of the workspace a name of its own")
      return undefined
    }
    const [directory] = directories
    if (directory === undefined) return undefined
    const manifest = joinPath(directory, packageFile)
    const { exports, main, types, typings } = json(manifest) ?? {}
    if (exports !== undefined && exports !== null) {
      const map = Predicate.isObject(exports) && Object.keys(exports).some((key) => key.startsWith(".")) ? exports : { ".": exports }
      const target = mapped(map, subpath === "" ? "." : `./${subpath}`, manifest, { file, line, specifier })
      return target === undefined ? undefined : fileAt(joinPath(directory, target), false)
    }
    if (subpath !== "") return fileAt(joinPath(directory, subpath), false)
    const entry = [types, typings, main].find(Predicate.isString)
    return entry === undefined ? fileAt(directory, true) : fileAt(joinPath(directory, entry), false)
  }
  const packageImport = (file: string, specifier: string, line: number): string | undefined => {
    const scope = upFrom(directoryOf(file)).map((directory) => joinPath(directory, packageFile)).find((path) => byPath.has(path))
    const imports = scope === undefined ? undefined : json(scope)?.imports
    const target = Predicate.isObject(imports) ? mapped(imports, specifier, scope!, { file, line, specifier }) : undefined
    if (target === undefined) return undefined
    return /^\.\.?\//.test(target) ? fileAt(joinPath(directoryOf(scope!), target), false) : packageExport(file, target, line)
  }

  return (file, specifier, line) => {
    if (/^\.\.?(\/|$)/.test(specifier)) return fileAt(joinPath(directoryOf(file), specifier), /(^|\/)\.{0,2}$/.test(specifier))
    const settings = optionsFor(directoryOf(file))
    const key = settings.paths === undefined ? undefined : matchKey(Object.keys(settings.paths), specifier)
    const targets = key === undefined ? [] : [settings.paths![key.key]].flat().filter(Predicate.isString).map((target) => target.replace("*", key.star))
    for (const path of targets) {
      const base = settings.baseUrl ?? settings.pathsFrom ?? ""
      const found = fileAt(path.startsWith("${configDir}") ? joinPath(settings.configDir, path.slice(12)) : joinPath(base, path), false)
      if (found !== undefined) return found
    }
    const under = settings.baseUrl === undefined ? undefined : fileAt(joinPath(settings.baseUrl, specifier), false)
    if (under !== undefined) return under
    return specifier.startsWith("#") ? packageImport(file, specifier, line) : packageExport(file, specifier, line)
  }
}

/**
 * The key of a map of names that `name` matches: itself, or else the one with a `*` whose prefix
 * and suffix it has, the longest prefix first, with what the `*` stands for.
 */
const matchKey = (keys: ReadonlyArray<string>, name: string): { readonly key: string; readonly star: string } | undefined => {
  if (keys.includes(name) && !name.includes("*")) return { key: name, star: "" }
  return keys.flatMap((key) => {
    const [prefix, suffix, ...more] = key.split("*")
    if (suffix === undefined || more.length > 0 || name.length < prefix!.length + suffix.length) return []
    return name.startsWith(prefix!) && name.endsWith(suffix) ? [{ key, prefix: prefix!, star: name.slice(prefix!.length, name.length - suffix.length) }] : []
  }).sort((a, b) => b.prefix.length - a.prefix.length || b.key.length - a.key.length)[0]
}

/** Where a configuration that `config` extends as `base` may be: the path from its directory, or a package installed in a node_modules above it. */
const extendsCandidates = (config: string, base: string): ReadonlyArray<string> => {
  const json = (path: string) => path.endsWith(".json") ? [path] : [path, `${path}.json`]
  if (/^\.\.?(\/|$)/.test(base)) return json(joinPath(directoryOf(config), base))
  const { name, subpath } = packageName(base)
  return upFrom(directoryOf(config)).flatMap((directory) => {
    const installed = joinPath(directory, "node_modules", name)
    return subpath === "" ? [joinPath(installed, tsconfigFile)] : json(joinPath(installed, subpath))
  })
}

/** A package's name and the path after it: `@shop/mailer` and `templates` in `@shop/mailer/templates`. */
const packageName = (specifier: string): { readonly name: string; readonly subpath: string } => {
  const parts = specifier.split("/")
  const length = specifier.startsWith("@") ? 2 : 1
  return { name: parts.slice(0, length).join("/"), subpath: parts.slice(length).join("/") }
}

/** JSON as `tsconfig.json` allows it, with comments and trailing commas, or why it does not parse. */
const readJson = (text: string): { readonly value: unknown } | { readonly error: string } => {
  const stringEnd = (from: number) => {
    let at = from + 1
    while (at < text.length && text[at] !== "\"") at += text[at] === "\\" ? 2 : 1
    return at + 1
  }
  const trailing = /,(?=\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*[}\]])/y
  let json = ""
  for (let at = 0; at < text.length; at++) {
    trailing.lastIndex = at
    if (text[at] === "\"") {
      const end = stringEnd(at)
      json += text.slice(at, end)
      at = end - 1
    } else if (text.startsWith("//", at)) {
      at = text.indexOf("\n", at) < 0 ? text.length : text.indexOf("\n", at) - 1
    } else if (text.startsWith("/*", at)) {
      at = text.indexOf("*/", at + 2) < 0 ? text.length : text.indexOf("*/", at + 2) + 1
    } else if (!trailing.test(text)) json += text[at]
  }
  try {
    return { value: JSON.parse(json) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** A path joined and made plain: `.` is left out and `..` steps out of the directory before it, or above the workspace. */
const joinPath = (...parts: ReadonlyArray<string>): string => {
  const plain: Array<string> = []
  for (const part of parts.join("/").split("/")) {
    if (part === "" || part === ".") continue
    if (part === ".." && plain.length > 0 && plain.at(-1) !== "..") plain.pop()
    else plain.push(part)
  }
  return plain.join("/")
}

/** A directory and each one above it in the workspace, up to its root, `""`. */
const upFrom = (directory: string): ReadonlyArray<string> => {
  const parts = directory === "" ? [] : directory.split("/")
  return [...parts.map((_, index) => parts.slice(0, parts.length - index).join("/")), ""]
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1)

/**
 * Which of a spec's rules and examples are work still to come; the rest is live. A Feature or a
 * Rule that declares a maturity, whatever its value, is still to come, and a Rule without one of
 * its own has its Feature's; one tagged `@open` is a question, still to come whatever it would
 * inherit. An example is its rule's, an open rule's included, and one under no rule its spec's.
 */
export const workOf = (spec: Spec) => {
  const declared = attribute(spec, "maturity")
  const toCome = isToCome(declared)
  const rule = (written: Rule) => {
    const own = attribute(written, "maturity")
    const maturity = own === undefined ? declared : own
    const open = written.tags.includes(made.tags.open)
    const examplesToCome = isToCome(maturity)
    return { maturity, toCome: open || examplesToCome, examplesToCome }
  }
  const rules = new Map(spec.rules.map((written) => [written.id, rule(written)]))
  return {
    /** Whether the spec itself is still to come. */
    spec: toCome,
    rule: (written: Rule) => rules.get(written.id) ?? rule(written),
    // A question excuses no example written under it: that is judged by the maturity the rule has.
    example: (scenario: Scenario) => scenario.rule === undefined ? toCome : rules.get(scenario.rule)?.examplesToCome ?? toCome
  }
}

/**
 * Where a node is in delivery. Work still to come is at the stage its maturity names, the first if
 * it names two, whatever its examples did: they are expected not to pass until it is built. A
 * maturity that names a stage sdp derives names none, since only a run says that. Live work is
 * `failing` while an example of it does not pass — failed, ambiguous, pending or without a step
 * definition, as the run that ran it fails — `verified` once all of them pass, `in-progress` while
 * only some have run and `unrun` until one has. Evidence, not a status field, says whether built
 * work works. Live work without an example has no stage.
 */
export const stageOf = (maturity: unknown, statuses: ReadonlyArray<StepStatus | undefined>, toCome: boolean): string | undefined => {
  if (toCome) {
    const [first] = [maturity].flat()
    const named = Predicate.isString(first) || Predicate.isNumber(first) ? String(first) : undefined
    return named === undefined || Object.values<string>(made.stages).includes(named) ? undefined : named
  }
  if (statuses.some((status) => status !== undefined && notPassing.has(status))) return made.stages.failing
  const verification = verificationOf(statuses)
  return verification === "passing"
    ? made.stages.verified
    : verification === "partial"
    ? made.stages.inProgress
    : verification === "unrun"
    ? made.stages.unrun
    : undefined
}

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
