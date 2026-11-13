/**
 * Builds the whole-system graph from parsed sources. Files are the source of
 * truth; the graph is a derived, disposable index that can be rebuilt at any
 * time (and exported for grep/jq). Building is pure: no IO happens here.
 * Besides what authors link, it derives which element imports which from the
 * code anchored to them, and links each element to the patterns its code links to.
 */
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import { type Attrs, formatSource, Graph, type GraphEdge, type GraphNode, type SourceRef } from "../model/Graph.ts"
import { notPassing, type RunResults, type ScenarioStatus, type Staleness, type StepStatus } from "../model/Results.ts"
import {
  activityRelation,
  attribute,
  hasKind,
  hasRelation,
  isDerived,
  isStage,
  isToCome,
  linkKeys,
  made,
  reservedRelations,
  type LiveStage, type Vocabulary
} from "../model/Vocabulary.ts"
import { type Annotation, codeNodeId, scanCode } from "../parse/Annotations.ts"
import type { Rule, Scenario } from "../parse/Gherkin.ts"
import { cache, type Located, type ModuleConfigs } from "../parse/ModuleConfigs.ts"
import { type Modules, readModules } from "../parse/Modules.ts"
import { type Exports, type Import, parseScript } from "../parse/Script.ts"
import { parseFeatureSpec, prefixCaseHint, prefixKind, type Spec, suiteId, writtenKind } from "../parse/Spec.ts"
import { scanStepDefinitions, type StepSignature } from "../parse/StepDefinitions.ts"

export interface SourceFile {
  readonly path: string
  readonly content: string
}

/** A path a glob matches that is no file sdp can read, and what it is instead. */
export interface NotAFile {
  readonly path: string
  readonly is:
    | "a link that leads to no file"
    | "a named pipe"
    | "a socket"
    | "a device"
    | "no file"
    | "a file sdp may not read"
    | "a file sdp could not read"
    | "a directory sdp may not list"
}

export interface ProjectInput {
  readonly root: string
  readonly config: Config
  readonly featureFiles: ReadonlyArray<SourceFile>
  /** The `.md` files beside the feature files and under the directories the features globs start in, by path: sdp reads none of them. */
  readonly markdownFiles: ReadonlyArray<string>
  readonly codeFiles: ReadonlyArray<SourceFile>
  /** The tsconfig.json, package.json and like files that say what the names code imports mean (`readModules`). */
  readonly moduleConfigs?: ModuleConfigs | undefined
  /** The step definition files: their definitions are read statically, never run. */
  readonly stepFiles?: ReadonlyArray<SourceFile> | undefined
  /** What the features and code globs match that is no file sdp can read: what it would hold is not read. */
  readonly notFiles?: ReadonlyArray<NotAFile> | undefined
  /** What the steps globs match that is no file sdp can read: the step definitions it would hold are not known. */
  readonly stepNotFiles?: ReadonlyArray<NotAFile> | undefined
  /** What the stored results say about the parsed specs' scenarios; without it the graph shows no results. */
  readonly evidence?: ((specs: ReadonlyArray<Spec>) => EvidenceView) | undefined
}

/** Where a scenario's stored result stands: its status while the result still counts, else why it does not. */
export interface Settled {
  readonly status: StepStatus | undefined
  /** What changed since the result was recorded, when it no longer counts. */
  readonly stale: Staleness | undefined
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
  /** What the steps globs match that is no file sdp can read, which `not-a-file` reports: definitions it would hold are not known. */
  readonly unread: ReadonlyArray<string>
}

export interface Project {
  readonly root: string
  readonly config: Config
  readonly specs: ReadonlyArray<Spec>
  readonly specById: ReadonlyMap<string, Spec>
  readonly annotations: ReadonlyArray<Annotation>
  /**
   * Each element with code in a language whose imports sdp does not read, and that code: what the
   * element imports there is not in the graph.
   */
  readonly importsUnread: ReadonlyArray<{ readonly element: string; readonly file: string }>
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
    if (parsed.spec === undefined) continue
    // An element or a pattern is declared where its code is: a spec of one would say what that code
    // is for in a second place, and its links belong to the rules of the features that realize it.
    if (hasKind(vocabulary, "architectural", parsed.spec.kind)) {
      const { file, id, kind } = parsed.spec
      diagnostics.push(diagnostic("declared-in-spec", {
        message: `${id} is declared by its code, as every ${kind} is, so this spec is not read`,
        node: id,
        source: { file, line: 1 },
        hint: `move its words to the doc comment of its code, beside \`@sdp ${vocabulary.relations.anchor} ${id}\`, and its links to the rules of the features that realize it, then delete ${file}; until it has code, work still to come that names it shows it as still to come`
      }))
      continue
    }
    specs.push(parsed.spec)
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
  const notFiles = [...input.notFiles ?? [], ...input.stepNotFiles ?? []]
  for (const { is, path: file } of new Map(notFiles.map((notFile) => [notFile.path, notFile])).values()) {
    diagnostics.push(diagnostic("not-a-file", {
      message: `${file} is ${is}, matched by the globs of the configuration: sdp reads files, so what it would hold is not read`,
      source: { file, line: 1 },
      hint: is === "a directory sdp may not list"
        ? `let sdp list it, or leave it out with exclude: ["${file}/**"] in the configuration`
        : `make it a file sdp can read, or leave it out with exclude: ["${file}"] in the configuration`
    }))
  }
  const annotations: Array<Annotation> = []
  const importsOf = new Map<string, ReadonlyArray<Import>>()
  const exportsOf = new Map<string, Exports>()
  for (const file of input.codeFiles) {
    const scan = scanCode(file.path, file.content, vocabulary.relations.anchor)
    annotations.push(...scan.annotations)
    if (scan.exports !== undefined) {
      importsOf.set(file.path, scan.imports)
      exportsOf.set(file.path, scan.exports)
    }
    for (const { hint, line, message } of scan.unreadable) {
      diagnostics.push(diagnostic("annotation-unreadable", { message, source: { file: file.path, line }, hint }))
    }
    for (const { hint, line, message } of scan.ignored) {
      diagnostics.push(diagnostic("annotation-ignored", { message, source: { file: file.path, line }, hint }))
    }
  }
  const stepDefinitions: Array<StepSignature> = []
  const stepPaths = new Set((input.stepFiles ?? []).map((file) => file.path))
  for (const file of input.stepFiles ?? []) {
    const scan = scanStepDefinitions(file.path, file.content, stepPaths)
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
      // What tags holds is said wherever a node is declared: sdp derives none for one declared in code.
      const [holds, hint] = key === made.tagsKey
        ? ["holds the Cucumber tags of a Feature, a Rule or a Scenario as written", `name the attribute otherwise: sdp keeps ${key} for the Cucumber tags it reads`]
        : ["is derived by sdp", `delete it: sdp computes ${key} (\`sdp vocabulary\` lists what it derives)`]
      diagnostics.push(diagnostic("derived-attribute", {
        message: `${id}: ${key} ${holds}, so the value written here is ignored`,
        node: id,
        source: at(key),
        hint
      }))
    }
    // Not assigned one by one: `__proto__` is a key like any other.
    return Object.fromEntries(kept)
  }
  /** What the examples that verify each spec did; a node without a spec of its own has none. */
  const examplesDid = new Map<string, ReadonlyArray<StepStatus | undefined>>()
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
      : compact({ ...marked, stage: stageOf(attrs.maturity, examplesDid.get(id) ?? [], toCome) })
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
          [made.tagsKey]: scenario.tags.length > 0 ? scenario.tags : undefined,
          description: scenario.description,
          rule: scenario.rule,
          steps: scenario.steps.length,
          examples: scenario.pickles.length > 1 ? scenario.pickles.length : undefined,
          status: (status ?? (stale ? "stale" : "unrun")) satisfies ScenarioStatus,
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
          [made.tagsKey]: rule.tags.length > 0 ? rule.tags : undefined,
          scenarios: examples.length,
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
    if (!nodes.has(spec.id)) examplesDid.set(spec.id, counted)
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
        [made.tagsKey]: spec.tags.length > 0 ? spec.tags : undefined,
        file: spec.file,
        summary: spec.summary || undefined,
        scenarios: spec.scenarios.length,
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
  // id's prefix names, a title and attributes. What was declared first holds; a value given
  // differently is reported where it is written.
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
      }
      // What the node holds before this anchor declares it. A title that only repeats the id was given by no one.
      const given = (key: string): unknown =>
        existing === undefined
          ? undefined
          : key === "kind"
          ? (named === undefined && !unnamedKind.has(target) ? existing.kind : undefined)
          : key === "title"
          ? (existing.title === target ? undefined : existing.title)
          : attribute(existing, key)
      if (existing === undefined) {
        nodes.set(target, { id: target, kind, title: Predicate.isString(title) ? title : target, attrs: staged(target, kind, attrs), source: at })
      } else {
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
      for (const [key] of declared) if (!sources.has(key) && given(key) === undefined) sources.set(key, at)
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
      ? { what: "phase", ids: phases, kinds: vocabulary.kinds.phase }
      : hasRelation(vocabulary, "plan", edge.rel) || edge.rel.startsWith(activityPrefix)
      ? { what: "iteration", ids: iterations, kinds: vocabulary.kinds.iteration }
      : hasRelation(vocabulary, "closes", edge.rel)
      ? { what: "phase or iteration", ids: [...phases, ...iterations], kinds: [...vocabulary.kinds.phase, ...vocabulary.kinds.iteration] }
      : undefined
    // A relation of the plan says the kind its target is, so a prefix of that kind in another case is
    // the fix; any other link may name a spec still to write whose id only begins like a prefix.
    const fixed = known && prefixCaseHint(edge.to, input.config, known.kinds)
    if (fixed !== undefined) return fixed
    if (known && known.ids.length > 0) return `use one of the declared ${known.what} ids: ${known.ids.join(", ")}`
    // `cart#slug` names a rule or an example of the spec cart, which its file declares.
    const [spec, part] = edge.to.split("#")
    const write = part !== undefined
      ? `write the \`Rule:\` or the \`Scenario:\` named ${part} in the file of the spec ${spec}, or fix the reference`
      : architectural(edge.to)
      ? `declare it in the doc comment of its code, \`@sdp ${vocabulary.relations.anchor} ${edge.to}\`, or fix the reference`
      : `write the spec \`@id=${edge.to}\` (\`sdp new <kind> "<title>" --id ${edge.to}\`), or fix the reference`
    const prefix = known ? undefined : prefixCaseHint(edge.to, input.config)
    return prefix === undefined ? write : `${write}; ${prefix}`
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

  // A path the globs match that is no file sdp can read is reported where it is (not-a-file): an import
  // of it names code sdp could not read, and is not reported again as one it cannot follow.
  const unreadCode = (input.notFiles ?? []).filter((notFile) => notFile.is !== "a directory sdp may not list")
    .map((notFile): SourceFile => ({ path: notFile.path, content: "" }))
  const modules = readModules(input.moduleConfigs ?? { root: input.root, top: "", files: [] }, [...input.codeFiles, ...unreadCode], exportsOf)
  const elements = elementsOf(annotations, nodes, vocabulary)
  const played = patternsOfElements(elements, present, nodes, vocabulary)
  const graph = new Graph(nodes.values(), [
    ...present,
    ...importsBetweenElements(elements, importsOf, input.codeFiles, modules, diagnostics),
    ...played
  ])

  return {
    root: input.root,
    config: input.config,
    specs,
    specById,
    annotations,
    // Code of an element sdp parsed is a file whose exports it read.
    importsUnread: [...elements].filter(([file]) => !exportsOf.has(file)).flatMap(([file, ids]) => [...ids].map((element) => ({ element, file }))),
    graph,
    diagnostics: sortDiagnostics(diagnostics),
    results: evidence?.results,
    steps: {
      files: (input.stepFiles ?? []).map((file) => file.path),
      definitions: stepDefinitions,
      unread: (input.stepNotFiles ?? []).map((notFile) => notFile.path)
    }
  }
}

/**
 * The elements each code file is part of: those any anchor of the file names, its own or one of its
 * declarations'. A pattern is no element: the code that applies it is part of one.
 */
const elementsOf = (
  annotations: ReadonlyArray<Annotation>,
  nodes: ReadonlyMap<string, GraphNode>,
  vocabulary: Vocabulary
): ReadonlyMap<string, ReadonlySet<string>> => {
  const elementsOf = new Map<string, Set<string>>()
  for (const annotation of annotations.filter((a) => a.rel === vocabulary.relations.anchor)) {
    const elements = annotation.targets.filter((id) => {
      const kind = nodes.get(id)?.kind ?? ""
      return hasKind(vocabulary, "architectural", kind) && !hasKind(vocabulary, "pattern", kind)
    })
    if (elements.length > 0) elementsOf.set(annotation.file, new Set([...elementsOf.get(annotation.file) ?? [], ...elements]))
  }
  return elementsOf
}

/**
 * `A -imports-> B` for each import in code of element A that loads code of element B, at the line
 * of that import: directly, or through code of no element, which is followed, whatever of it is
 * imported, until it reaches code of an element — so a dependency through a helper, and a cycle, is
 * in the graph. An import of types alone loads no code — written with `type`, or of names the module
 * exports as types alone — and no element imports itself. A pattern is no element: its code is
 * followed like code of no element. A name means the code file TypeScript resolves it to
 * (`readModules`); one sdp cannot follow, though it could name the workspace's code, is reported
 * where it is written, in code of no element too, as is code of no element that does not parse;
 * what sdp could not read of a configuration file such a name depends on is reported once, where
 * that is written, as is a tsconfig.json that extends one outside the repository.
 */
const importsBetweenElements = (
  elementsOf: ReadonlyMap<string, ReadonlySet<string>>,
  importsOf: ReadonlyMap<string, ReadonlyArray<Import>>,
  codeFiles: ReadonlyArray<SourceFile>,
  modules: Modules,
  diagnostics: Array<Diagnostic>
): ReadonlyArray<GraphEdge> => {
  const reported = new Set<string>()
  const report = (rule: "import-unresolved" | "import-config-outside", { file, hint, line, message }: Located) => {
    if (reported.has(`${rule}:${file}:${line}:${message}`)) return
    reported.add(`${rule}:${file}:${line}:${message}`)
    diagnostics.push(diagnostic(rule, { message, hint, source: { file, line } }))
  }
  const contents = new Map(codeFiles.map((file) => [file.path, file.content]))
  /** What a code file imports: as read with its annotations, or else as it parses. */
  const importsIn = cache((file: string): ReadonlyArray<Import> => {
    const read = importsOf.get(file)
    if (read !== undefined) return read
    const script = parseScript(file, contents.get(file) ?? "")
    if (script?.error === undefined) return script?.imports() ?? []
    report("import-unresolved", {
      file,
      line: script.error.line,
      message: `${file} does not parse, so what it imports is not read: ${script.error.message}`,
      hint: "fix the syntax error so that sdp can follow what it imports"
    })
    return []
  })
  /** The code file `imported`, written in `file`, loads code from, if any; what sdp cannot follow of it is reported. */
  const loaded = (file: string, imported: Import): string | undefined => {
    const { module, outside, unread, unresolved } = modules.resolve(file, imported)
    if (unresolved !== undefined) report("import-unresolved", { ...unresolved, file, line: imported.line })
    for (const each of unread ?? []) report("import-unresolved", each)
    for (const each of outside ?? []) report("import-config-outside", each)
    return module !== undefined && (imported.names === undefined || modules.loadsCode(module, imported.names)) ? module : undefined
  }
  /** The code files code of no element loads code from, each import resolved once. */
  const loadedBy = cache((file: string) => importsIn(file).flatMap((imported) => loaded(file, imported) ?? []))
  /** The elements whose code a code file is, or else those its code reaches through code of no element. */
  const reached = cache((module: string): ReadonlySet<string> => {
    const found = new Set<string>()
    const seen = new Set<string>()
    const pending = [module]
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (seen.has(next)) continue
      seen.add(next)
      const elements = elementsOf.get(next)
      if (elements === undefined) pending.push(...loadedBy(next))
      else for (const element of elements) found.add(element)
    }
    return found
  })
  const edges: Array<GraphEdge> = []
  for (const [file, elements] of elementsOf) {
    for (const imported of importsIn(file)) {
      const module = loaded(file, imported)
      for (const to of module === undefined ? [] : reached(module)) {
        for (const element of elements) {
          if (element !== to) edges.push({ from: element, rel: made.relations.imports, to, source: { file, line: imported.line } })
        }
      }
    }
  }
  return edges
}

/**
 * `A -applies-> P` for each link from code to pattern P, by the relation the code wrote and at its tag,
 * from each element A the code's file is part of: what code of an element applies, the element does.
 */
const patternsOfElements = (
  elementsOf: ReadonlyMap<string, ReadonlySet<string>>,
  links: ReadonlyArray<GraphEdge>,
  nodes: ReadonlyMap<string, GraphNode>,
  vocabulary: Vocabulary
): ReadonlyArray<GraphEdge> =>
  links.flatMap((link) => {
    const code = nodes.get(link.from)
    const file = code?.kind === made.kinds.code ? code.attrs.file : undefined
    if (!Predicate.isString(file) || link.rel === vocabulary.relations.anchor || !hasKind(vocabulary, "pattern", nodes.get(link.to)?.kind ?? "")) return []
    return [...elementsOf.get(file) ?? []].map((element) => ({ from: element, rel: link.rel, to: link.to, source: link.source }))
  })

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
    return named === undefined || isStage(named) ? undefined : named
  }
  return liveStageOf(statuses)
}

const liveStageOf = (statuses: ReadonlyArray<StepStatus | undefined>): LiveStage | undefined => {
  if (statuses.length === 0) return undefined
  if (statuses.some((status) => status !== undefined && notPassing.has(status))) return made.stages.failing
  return statuses.every((status) => status === "passed")
    ? made.stages.verified
    : statuses.every((status) => status === undefined)
    ? made.stages.unrun
    : made.stages.inProgress
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
