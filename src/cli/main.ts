/**
 * `sdp` — the command line. Every read command prints greppable text by
 * default and JSON with `--json`, so people and agents use the same tool.
 */
import parseTagExpression from "@cucumber/tag-expressions"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, DateTime, Effect, FileSystem, Option, Path, Result } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { architectureSummary, architectureView, rankCandidates } from "../arch/Architecture.ts"
import { check } from "../check/Check.ts"
import { isActive, type Project } from "../graph/Build.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { contextBundle } from "../graph/Context.ts"
import { exportGraph, graphFormats, nodeJson } from "../graph/Export.ts"
import { formatPath, projectOrderings, query } from "../graph/Query.ts"
import { statusSummary } from "../graph/Status.ts"
import { lifecycle, renderLifecycle } from "../lifecycle/Lifecycle.ts"
import { formatSource } from "../model/Graph.ts"
import { builtinSteps } from "../run/Builtin.ts"
import type { ScenarioResult } from "../run/Results.ts"
import { mergeResults, runScenarios, summarize } from "../run/Runner.ts"
import { loadProject, loadStepModules, writeResults } from "../workspace/Workspace.ts"
import { c, formatDiagnostic, formatScenario, nodeRows, table } from "./format.ts"
import { agentsTemplate, configTemplate, directoryFor, fileNameFor, newId, specTemplate } from "./templates.ts"
import { serveMcp } from "../mcp/Server.ts"

// @sdp is ARCH-cli

const json = Flag.Boolean("json").pipe(Flag.withDescription("Print machine-readable JSON"), Flag.withDefault(false))

const sdp = Command.make("sdp").pipe(
  Command.withSharedFlags({
    root: Flag.String("root").pipe(
      Flag.withAlias("C"),
      Flag.withDescription("Workspace root (directory containing sdp.config.yaml)"),
      Flag.withDefault(".")
    )
  }),
  Command.withDescription("Living specifications, curated architecture and decisions as one queryable graph")
)

const workspaceRoot = Effect.gen(function*() {
  const { root } = yield* sdp
  const path = yield* Path.Path
  return path.resolve(root)
})

const fail = (message: string) =>
  Effect.gen(function*() {
    yield* Console.error(c.red(message))
    process.exitCode = 1
  })

const printJson = (value: unknown) => Console.log(JSON.stringify(value, null, 2))

const runQuery = (project: Project, source: string) =>
  query(project.graph, source, { orderings: projectOrderings(project.config.maturity) })

// --- graph ------------------------------------------------------------------

const graphCommand = Command.make(
  "graph",
  {
    format: Flag.Literals("format", graphFormats).pipe(Flag.withAlias("f"), Flag.withDefault("jsonl")),
    write: Flag.Boolean("write").pipe(
      Flag.withDescription("Write .sdp/graph.jsonl and .sdp/graph.tsv for grep/jq instead of printing"),
      Flag.withDefault(false)
    ),
    select: Flag.String("query").pipe(Flag.withAlias("q"), Flag.withDescription("Only nodes matched by this query"), Flag.optional)
  },
  Effect.fn(function*({ format, select, write }) {
    const root = yield* workspaceRoot
    const project = yield* loadProject(root)
    let graph = project.graph
    if (Option.isSome(select)) {
      const result = runQuery(project, select.value)
      if (Result.isFailure(result)) return yield* fail(result.failure.message)
      graph = graph.subgraph(result.success.paths.flatMap((p) => [p.start, ...p.steps.map((s) => s.node)]))
    }
    if (write) {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      yield* fs.makeDirectory(path.join(root, ".sdp"), { recursive: true })
      yield* fs.writeFileString(path.join(root, ".sdp/graph.jsonl"), exportGraph(graph, "jsonl"))
      yield* fs.writeFileString(path.join(root, ".sdp/graph.tsv"), exportGraph(graph, "tsv"))
      yield* Console.log(`wrote .sdp/graph.jsonl and .sdp/graph.tsv (${graph.nodes.size} nodes, ${graph.edges.length} edges)`)
      return
    }
    process.stdout.write(exportGraph(graph, format))
  })
).pipe(Command.withDescription("Export the whole system graph (jsonl, json, tsv, dot, mermaid)"))

// --- query ------------------------------------------------------------------

const queryCommand = Command.make(
  "query",
  {
    expression: Argument.String("expression").pipe(Argument.withDescription("SDPQ, e.g. 'requirement[maturity=ready] -realized-by-> *'")),
    paths: Flag.Boolean("paths").pipe(Flag.withDescription("Print matched paths instead of end nodes"), Flag.withDefault(false)),
    ids: Flag.Boolean("ids").pipe(Flag.withDescription("Print only ids, one per line"), Flag.withDefault(false)),
    json
  },
  Effect.fn(function*({ expression, ids, json, paths }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const result = runQuery(project, expression)
    if (Result.isFailure(result)) return yield* fail(`query error: ${result.failure.message}`)
    const { nodes, truncated } = result.success
    if (json) return yield* printJson(paths ? result.success.paths : nodes.map(nodeJson))
    if (paths) {
      for (const p of result.success.paths) yield* Console.log(formatPath(p))
    } else if (ids) {
      for (const n of nodes) yield* Console.log(n.id)
    } else if (nodes.length > 0) {
      yield* Console.log(table(nodeRows(nodes)))
    }
    if (truncated) yield* Console.error(c.yellow("result truncated"))
    if (!ids) yield* Console.error(c.dim(`${nodes.length} node(s)`))
  })
).pipe(
  Command.withAlias("q"),
  Command.withDescription("Query the graph with a path pattern"),
  Command.withExamples([
    { command: "sdp q 'requirement[maturity<ready]'", description: "Requirements not ready yet" },
    { command: "sdp q 'element[significant] !-*- decision'", description: "Significant elements without a decision" },
    { command: "sdp q '#DEC-0002 <-*- *'", description: "Everything that points at a decision" }
  ])
)

// --- show / context ---------------------------------------------------------

const showCommand = Command.make(
  "show",
  { id: Argument.String("id"), json },
  Effect.fn(function*({ id, json }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const node = project.graph.node(id)
    if (!node) return yield* fail(`no node ${id}`)
    const out = project.graph.out(id)
    const inc = project.graph.in(id)
    if (json) return yield* printJson({ node: nodeJson(node), out, in: inc })
    yield* Console.log(`${c.bold(node.id)}  ${node.kind}  ${node.title}  ${c.dim(formatSource(node.source))}`)
    for (const [k, v] of Object.entries(node.attrs)) yield* Console.log(`  ${k}: ${JSON.stringify(v)}`)
    for (const e of out) yield* Console.log(`  -${e.rel}-> ${e.to}  ${c.dim(project.graph.node(e.to)?.title ?? "")}`)
    for (const e of inc) yield* Console.log(`  <-${e.rel}- ${e.from}  ${c.dim(project.graph.node(e.from)?.title ?? "")}`)
  })
).pipe(Command.withDescription("Show one node with its attributes and edges"))

const contextCommand = Command.make(
  "context",
  { id: Argument.String("id"), depth: Flag.Int("depth").pipe(Flag.withDefault(2)) },
  Effect.fn(function*({ depth, id }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const bundle = contextBundle(project, id, depth)
    if (!bundle) return yield* fail(`no node ${id}`)
    yield* Console.log(bundle)
  })
).pipe(Command.withDescription("Markdown context bundle for one node: spec, links, scenarios, architecture, decisions, code"))

// --- check ------------------------------------------------------------------

const checkCommand = Command.make(
  "check",
  {
    json,
    severity: Flag.Literals("severity", ["error", "warning", "info"]).pipe(
      Flag.withDescription("Minimum severity to print"),
      Flag.withDefault("info")
    )
  },
  Effect.fn(function*({ json, severity }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const rank = { error: 0, warning: 1, info: 2 } as const
    const diagnostics = check(project).filter((d) => rank[d.severity] <= rank[severity])
    if (diagnostics.some((d) => d.severity === "error")) process.exitCode = 1
    if (json) return yield* printJson(diagnostics)
    for (const d of diagnostics) yield* Console.log(formatDiagnostic(d))
    const count = (s: string) => diagnostics.filter((d) => d.severity === s).length
    yield* Console.log(c.dim(`${count("error")} error(s), ${count("warning")} warning(s), ${count("info")} info`))
  })
).pipe(Command.withDescription("Validate links, maturity gates, decisions and architectural significance"))

// --- run / gate -------------------------------------------------------------

const gateKinds = new Set(["milestone"])

const executeRun = Effect.fn("executeRun")(function*(options: {
  readonly targets: ReadonlyArray<string>
  readonly tags: Option.Option<string>
  readonly json: boolean
  readonly snippets: boolean
  readonly verbose: boolean
  readonly enforceGates: boolean
}) {
  const root = yield* workspaceRoot
  let project = yield* loadProject(root)
  const modules = [builtinSteps, ...(yield* loadStepModules(root, project.config))]
  const tagExpression = Option.map(options.tags, parseTagExpression)
  const wanted = (scenarioId: string, specId: string, file: string) =>
    options.targets.length === 0 ||
    options.targets.some((t) => t === specId || t === scenarioId || file === t || file.startsWith(t.endsWith("/") ? t : `${t}/`))
  const select = (gates: boolean) => (scenario: Scenario, spec: Spec) =>
    isActive(spec) &&
    (gateKinds.has(spec.kind) || scenario.pickles.some((p) => p.tags.includes("@gate"))) === gates &&
    wanted(scenario.id, spec.id, spec.file) &&
    (Option.isNone(tagExpression) || scenario.pickles.some((p) => tagExpression.value.evaluate([...p.tags])))
  const print = (r: ScenarioResult) =>
    options.json ? Effect.void : Console.log(formatScenario(r, { snippets: options.snippets, verbose: options.verbose }))

  // Ordinary scenarios first; gates (milestones, @gate) then see the fresh results.
  const first = yield* runScenarios({ project, modules, filter: select(false), onScenario: print })
  let merged = mergeResults(project.results, first, project)
  yield* writeResults(root, project.config, merged)
  project = yield* loadProject(root)
  const second = yield* runScenarios({ project, modules, filter: select(true), onScenario: print })
  merged = mergeResults(merged, second, project)
  yield* writeResults(root, project.config, merged)

  const scenarios = Object.values(first.scenarios)
  const gates = Object.values(second.scenarios)
  const counts = summarize(scenarios)
  const gateCounts = summarize(gates)
  // A gate that is not met yet is information, not a broken build; `sdp gate <id>` enforces it.
  const failed = options.enforceGates ? gateCounts.failed + gateCounts.ambiguous : counts.failed + counts.ambiguous
  if (failed > 0) process.exitCode = 1
  if (options.json) return yield* printJson({ summary: counts, gates: gateCounts, scenarios: [...scenarios, ...gates] })
  const describe = (c: Readonly<Record<string, number>>) =>
    Object.entries(c).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`).join(", ") || "none"
  if (scenarios.length > 0 || gates.length === 0) yield* Console.log(`\n${scenarios.length} scenario(s): ${describe(counts)}`)
  if (gates.length > 0) yield* Console.log(`${gates.length} gate scenario(s): ${describe(gateCounts)}`)
  if (counts.undefined > 0 && !options.snippets) {
    yield* Console.log(c.dim("undefined steps describe behaviour not automated yet; --snippets prints step definition stubs"))
  }
})

const runCommand = Command.make(
  "run",
  {
    targets: Argument.String("targets").pipe(
      Argument.withDescription("Spec ids, scenario ids, files or directories (default: everything)"),
      Argument.variadic()
    ),
    tags: Flag.String("tags").pipe(Flag.withDescription("Cucumber tag expression, e.g. '@nfr and not @slow'"), Flag.optional),
    snippets: Flag.Boolean("snippets").pipe(Flag.withDescription("Print stubs for undefined steps"), Flag.withDefault(false)),
    verbose: Flag.Boolean("verbose").pipe(Flag.withDescription("Show passed steps too"), Flag.withDefault(false)),
    json
  },
  Effect.fn(function*(input) {
    yield* executeRun({ ...input, enforceGates: false })
  })
).pipe(Command.withDescription("Execute scenarios and record results (.sdp/results.json)"))

const gateCommand = Command.make(
  "gate",
  { milestone: Argument.String("milestone"), json },
  Effect.fn(function*({ json, milestone }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const node = project.graph.node(milestone)
    if (!node) return yield* fail(`no node ${milestone}`)
    yield* Console.log(`${c.bold(node.id)} ${node.title}`)
    yield* executeRun({ targets: [milestone], tags: Option.none(), json, snippets: false, verbose: false, enforceGates: true })
  })
).pipe(Command.withDescription("Evaluate a milestone's gate scenarios against the current graph"))

// --- arch / lifecycle / status ----------------------------------------------

const archCommand = Command.make(
  "arch",
  {
    format: Flag.Literals("format", ["text", "mermaid", "dot", "json"]).pipe(Flag.withDefault("text")),
    candidates: Flag.Boolean("candidates").pipe(
      Flag.withDescription("Suggest elements an architect may want to look at (suggestions only)"),
      Flag.withDefault(false)
    )
  },
  Effect.fn(function*({ candidates, format }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const summary = architectureSummary(project)
    const view = architectureView(project)
    if (candidates) {
      const ranked = rankCandidates(project)
      if (format === "json") return yield* printJson(ranked.map((r) => ({ ...nodeJson(r.node), score: r.score, reasons: r.reasons })))
      yield* Console.log("Candidates worth a look (suggestions; what is significant is the architect's call):")
      for (const r of ranked) yield* Console.log(`  ${String(r.score).padStart(3)}  ${r.node.id}  ${c.dim(r.reasons.join("; "))}`)
      return
    }
    if (format === "json") {
      return yield* printJson({
        significant: summary.significant.map((n) => n.id),
        nodes: view.nodes.map(nodeJson),
        edges: view.edges
      })
    }
    if (format !== "text") {
      process.stdout.write(exportGraph(project.graph.subgraph(view.nodes.map((n) => n.id)), format))
      return
    }
    yield* Console.log(`${c.bold("Significant")} (marked by architects): ${summary.significant.length}`)
    for (const n of summary.significant) {
      yield* Console.log(`\n  ${c.bold(n.id)}  ${n.title}  ${c.dim(formatSource(n.source))}`)
      if (n.attrs.rationale) yield* Console.log(`    why: ${String(n.attrs.rationale)}`)
      for (const e of view.edges.filter((e) => e.from === n.id)) {
        yield* Console.log(`    -${e.rel}-> ${e.to}  ${c.dim(project.graph.node(e.to)?.title ?? "")}`)
      }
      for (const e of view.edges.filter((e) => e.to === n.id)) {
        yield* Console.log(`    <-${e.rel}- ${e.from}  ${c.dim(project.graph.node(e.from)?.title ?? "")}`)
      }
    }
    if (summary.declared.length > 0) {
      yield* Console.log(c.dim(`\n  ${summary.declared.length} declared, not significant: ${summary.declared.map((n) => n.id).join(", ")}`))
    }
  })
).pipe(Command.withDescription("The curated architecture: significant elements, their patterns, decisions and quality requirements"))

const lifecycleCommand = Command.make(
  "lifecycle",
  { json },
  Effect.fn(function*({ json }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const report = lifecycle(project, DateTime.formatIsoDate(yield* DateTime.now))
    if (json) {
      return yield* printJson({
        phases: report.phases.map((p) => ({
          ...nodeJson(p.node),
          milestones: p.milestones.map(nodeJson),
          iterations: p.iterations.map((i) => ({ ...nodeJson(i.node), stages: i.stages, items: i.items.map((n) => n.id) }))
        })),
        disciplines: Object.fromEntries(report.disciplines.map((d) => [d.discipline, d.activity])),
        iterations: report.iterations.map((i) => i.id),
        current: report.current?.id,
        currentPhase: report.currentPhase?.id,
        unplanned: report.unplanned.map((n) => n.id)
      })
    }
    yield* Console.log(renderLifecycle(report))
  })
).pipe(Command.withDescription("Phases, iterations, milestone gates and discipline activity (RUP view)"))

const statusCommand = Command.make(
  "status",
  { json },
  Effect.fn(function*({ json }) {
    const project = yield* loadProject(yield* workspaceRoot)
    const summary = statusSummary(project)
    const stageOrder = [...project.config.maturity, "in-progress", "verified"]
    if (json) return yield* printJson(summary)
    const line = (label: string, m: Record<string, number>, order?: ReadonlyArray<string>) => {
      const keys = order ? [...order.filter((k) => k in m), ...Object.keys(m).filter((k) => !order.includes(k))] : Object.keys(m)
      return `${c.bold(label.padEnd(13))} ${keys.map((k) => `${k} ${m[k]}`).join(" · ") || "—"}`
    }
    yield* Console.log(`${c.bold("graph".padEnd(13))} ${summary.nodes} nodes, ${summary.edges} edges, ${summary.specFiles} spec files`)
    yield* Console.log(line("kinds", summary.kinds))
    yield* Console.log(line("relations", summary.relations))
    yield* Console.log(line("spec stages", summary.stages, stageOrder))
    yield* Console.log(line("decisions", summary.decisions))
    yield* Console.log(line("scenarios", summary.scenarios, ["passed", "failed", "pending", "undefined", "unrun", "stale"]))
    yield* Console.log(
      `${c.bold("architecture".padEnd(13))} ${summary.architecture.significant} significant · ${summary.architecture.declared} declared, not significant`
    )
    yield* Console.log(line("check", summary.diagnostics, ["error", "warning", "info"]))
  })
).pipe(Command.withDescription("One-screen summary of the delivery state"))

// --- authoring --------------------------------------------------------------

const newCommand = Command.make(
  "new",
  {
    kind: Argument.String("kind").pipe(Argument.withDescription("requirement, nfr, decision, element, pattern, milestone, or any kind")),
    title: Argument.String("title"),
    id: Flag.String("id").pipe(Flag.optional),
    maturity: Flag.String("maturity").pipe(Flag.withDefault("idea")),
    dir: Flag.String("dir").pipe(Flag.withDescription("Target directory (default depends on kind)"), Flag.optional)
  },
  Effect.fn(function*({ dir, id, kind, maturity, title }) {
    const root = yield* workspaceRoot
    const project = yield* loadProject(root, { withResults: false })
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const nodeId = Option.getOrElse(id, () => newId(kind, title, project.config, [...project.graph.nodes.keys()]))
    if (project.graph.node(nodeId)) return yield* fail(`id ${nodeId} already exists at ${formatSource(project.graph.node(nodeId)!.source)}`)
    const directory = Option.getOrElse(dir, () => directoryFor[kind] ?? `specs/${kind}`)
    const file = path.join(directory, fileNameFor(kind, nodeId, title))
    const today = DateTime.formatIsoDate(yield* DateTime.now)
    yield* fs.makeDirectory(path.join(root, directory), { recursive: true })
    yield* fs.writeFileString(path.join(root, file), specTemplate({ kind, id: nodeId, title, maturity, today }))
    yield* Console.log(`${nodeId}\t${file}`)
  })
).pipe(Command.withDescription("Create a spec, decision, element, ... from a template"))

const initCommand = Command.make(
  "init",
  {},
  Effect.fn(function*() {
    const root = yield* workspaceRoot
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const write = Effect.fnUntraced(function*(file: string, content: string) {
      const target = path.join(root, file)
      if (yield* fs.exists(target)) return yield* Console.log(c.dim(`exists  ${file}`))
      yield* fs.makeDirectory(path.dirname(target), { recursive: true })
      yield* fs.writeFileString(target, content)
      yield* Console.log(`created ${file}`)
    })
    yield* write("sdp.config.yaml", configTemplate)
    yield* write(".sdp/.gitignore", "# regenerate with `sdp graph --write`; commit results.json if you want verified status in git\ngraph.*\n")
    yield* write("AGENTS.sdp.md", agentsTemplate)
    yield* Console.log(c.dim("next: sdp new requirement \"My first idea\"  ·  merge AGENTS.sdp.md into your AGENTS.md / CLAUDE.md"))
  })
).pipe(Command.withDescription("Create sdp.config.yaml and agent instructions in the workspace"))

const mcpCommand = Command.make(
  "mcp",
  {},
  Effect.fn(function*() {
    yield* serveMcp(yield* workspaceRoot)
  })
).pipe(Command.withDescription("Serve the graph to AI agents over MCP (stdio)"))

sdp.pipe(
  Command.withSubcommands([
    initCommand,
    newCommand,
    statusCommand,
    queryCommand,
    showCommand,
    contextCommand,
    graphCommand,
    checkCommand,
    runCommand,
    gateCommand,
    archCommand,
    lifecycleCommand,
    mcpCommand
  ]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
