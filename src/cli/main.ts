/**
 * `sdp` — the command line. Every read command prints greppable text by
 * default and JSON with `--json`, so people and agents use the same tool.
 */
// Subpath imports: the package index loads every Node service (HTTP, sockets, …) and slows every start.
import { annotate } from "sdp/annotations"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Console, DateTime, Effect, FileSystem, Option, Path, Result } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { architectureJson, architectureSummary, architectureView, rankCandidates } from "../arch/Architecture.ts"
import { check } from "../check/Check.ts"
import { isGate } from "../graph/Build.ts"
import { contextBundle } from "../graph/Context.ts"
import { exportGraph, graphFormats, nodeJson } from "../graph/Export.ts"
import { formatPath, queryProject, querySyntax, unusedNamesNote } from "../graph/Query.ts"
import { statusSummary } from "../graph/Status.ts"
import { idsDeclaration } from "../graph/Types.ts"
import { lifecycle, renderLifecycle } from "../lifecycle/Lifecycle.ts"
import { atLeast } from "../model/Diagnostic.ts"
import { formatSource } from "../model/Graph.ts"
import { builtinSteps } from "../run/Builtin.ts"
import { makeMatcher, snippetModule } from "../run/Match.ts"
import type { ScenarioResult } from "../run/Results.ts"
import { summarize } from "../run/Runner.ts"
import { ensureReadable, runWorkspace } from "../run/Session.ts"
import { findWorkspaceRoot, loadConfig, loadProject, loadSteps } from "../workspace/Workspace.ts"
import { c, formatDiagnostic, formatScenario, nodeRows, table } from "./format.ts"
import { agentsTemplate, configTemplate, newSpec, templateKinds } from "./templates.ts"

annotate(import.meta, { is: "ARCH-cli" })

// `sdp … | head` closes the pipe early; that is the reader's choice, not an error.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(process.exitCode ?? 0)
  throw error
})

const json = Flag.Boolean("json").pipe(Flag.withDescription("Print machine-readable JSON"), Flag.withDefault(false))

const sdp = Command.make("sdp").pipe(
  Command.withSharedFlags({
    root: Flag.String("root").pipe(
      Flag.withAlias("C"),
      Flag.withDescription(
        "Workspace root (default: the nearest directory, current or above, with an sdp.config.* file; else the current one)"
      ),
      Flag.optional
    )
  }),
  Command.withDescription("Living specifications, curated architecture and decisions as one queryable graph")
)

/** `-C <dir>`, or the nearest directory with a configuration file, the way git finds its repository. */
const workspaceRoot = Effect.gen(function*() {
  const { root } = yield* sdp
  const path = yield* Path.Path
  return Option.isSome(root) ? path.resolve(root.value) : yield* findWorkspaceRoot(process.cwd())
})

const fail = (message: string) =>
  Effect.gen(function*() {
    yield* Console.error(c.red(message))
    process.exitCode = 1
  })

const printJson = (value: unknown) => Console.log(JSON.stringify(value, null, 2))

// --- graph ------------------------------------------------------------------

const graphCommand = Command.make(
  "graph",
  {
    format: Flag.Literals("format", graphFormats).pipe(Flag.withAlias("f"), Flag.withDescription("Output format"), Flag.withDefault("jsonl")),
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
      const result = queryProject(project, select.value)
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
    const result = queryProject(project, expression)
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
    if (truncated) yield* Console.error(c.yellow(`result cut short: ${result.success.limits.join("; ")} — the answer may be incomplete`))
    if (!ids) yield* Console.error(c.dim(`${nodes.length} node(s)`))
    // An empty result because of a misspelt kind or relation should not look like a real "none".
    const note = nodes.length === 0 ? unusedNamesNote(project, expression) : undefined
    if (note) yield* Console.error(c.yellow(note))
  })
).pipe(
  Command.withAlias("q"),
  Command.withShortDescription("Query the graph with a path pattern"),
  Command.withDescription(`Query the graph with a path pattern (SDPQ):\n\n${querySyntax.replace(/^/gm, "  ")}`),
  Command.withExamples([
    { command: "sdp q 'requirement[maturity<ready]'", description: "Requirements not ready yet" },
    { command: "sdp q 'element[significant] !-*- decision'", description: "Significant elements without a decision" },
    { command: "sdp q '#DEC-0002 <-*- *'", description: "Everything that points at a decision" }
  ])
)

// --- show / context ---------------------------------------------------------

const showCommand = Command.make(
  "show",
  { id: Argument.String("id").pipe(Argument.withDescription("Node id, e.g. REQ-guest-checkout")), json },
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
  {
    id: Argument.String("id").pipe(Argument.withDescription("Node id, e.g. REQ-guest-checkout")),
    depth: Flag.Int("depth").pipe(
      Flag.withDescription("Hops to search for significant architecture, quality requirements and decisions"),
      Flag.withDefault(2)
    )
  },
  Effect.fn(function*({ depth, id }) {
    const root = yield* workspaceRoot
    const project = yield* loadProject(root)
    if (!project.graph.node(id)) return yield* fail(`no node ${id}`)
    // Step definitions show which steps are not automated yet without a run; a broken step file
    // must not keep anyone from reading the context, so it only costs that part.
    const steps = yield* loadSteps(root, project.config).pipe(
      Effect.map((loaded) => ({ matcher: makeMatcher([builtinSteps, ...loaded.modules]), files: loaded.files })),
      Effect.catchTag("StepLoadError", (e) =>
        Effect.as(Console.error(c.yellow(`${e.file}: could not load step definitions: ${e.message}`)), undefined))
    )
    yield* Console.log(contextBundle(project, id, depth, steps))
  })
).pipe(
  Command.withDescription(
    "Markdown context bundle for one node: spec, why it is not ready, links, scenarios with the step definitions still to write, architecture, quality requirements, decisions, code"
  )
)

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
    const diagnostics = check(project).filter((d) => atLeast(d.severity, severity))
    if (diagnostics.some((d) => d.severity === "error")) process.exitCode = 1
    if (json) return yield* printJson(diagnostics)
    for (const d of diagnostics) yield* Console.log(formatDiagnostic(d))
    const count = (s: string) => diagnostics.filter((d) => d.severity === s).length
    yield* Console.log(c.dim(`${count("error")} error(s), ${count("warning")} warning(s), ${count("info")} info`))
  })
).pipe(Command.withDescription("Validate front matter, links, Gherkin, maturity gates and decision records; exit 1 on errors"))

// --- run / gate -------------------------------------------------------------

const executeRun = Effect.fn("executeRun")(function*(options: {
  readonly targets: ReadonlyArray<string>
  readonly tags: Option.Option<string>
  readonly json: boolean
  readonly snippets: boolean
  readonly verbose: boolean
  readonly enforceGates: boolean
  readonly concurrency?: number | undefined
}) {
  const root = yield* workspaceRoot
  const config = yield* loadConfig(root)
  const steps = yield* loadSteps(root, config)
  for (const file of steps.empty) {
    yield* Console.error(c.yellow(`warning: ${file} defines no steps: export the module, e.g. \`export default defineSteps(…)\``))
  }
  const print = (r: ScenarioResult) => options.json ? Effect.void : Console.log(formatScenario(r, { verbose: options.verbose }))
  const run = yield* runWorkspace(root, {
    modules: [builtinSteps, ...steps.modules],
    imports: steps.imports,
    selection: { targets: yield* fromHere(root, options.targets), tags: Option.getOrUndefined(options.tags) },
    concurrency: options.concurrency,
    onScenario: print
  })

  const { gates, scenarios } = run
  const counts = summarize(scenarios)
  const gateCounts = summarize(gates)
  // A gate that is not met yet is information, not a broken build; `sdp gate <id>` enforces it:
  // a milestone is met only when it has gate scenarios and every one of them passed.
  const failed = options.enforceGates
    ? gates.length === 0 || gateCounts.passed < gates.length
    : counts.failed + counts.ambiguous > 0
  if (failed) process.exitCode = 1
  const snippets = [...scenarios, ...gates].flatMap((r) => r.pickles.flatMap((p) => p.steps.flatMap((s) => s.snippet ? [s.snippet] : [])))
  const module = options.snippets && snippets.length > 0 ? snippetModule(snippets, steps.files) : undefined
  if (options.json) {
    return yield* printJson({
      summary: counts,
      gates: gateCounts,
      stale: run.stale,
      scenarios: [...scenarios, ...gates],
      ...(module ? { snippets: module } : {})
    })
  }
  const describe = (c: Readonly<Record<string, number>>) =>
    Object.entries(c).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`).join(", ") || "none"
  if (scenarios.length > 0 || gates.length === 0) yield* Console.log(`\n${scenarios.length} scenario(s): ${describe(counts)}`)
  if (gates.length > 0) yield* Console.log(`${gates.length} gate scenario(s): ${describe(gateCounts)}`)
  const unselected = [...scenarios, ...gates].flatMap((r) => r.pickles.filter((p) => p.status === "skipped" && p.steps.length === 0)).length
  if (unselected > 0) {
    yield* Console.log(c.dim(`${unselected} example(s) not selected are skipped: a scenario passes only when one run passes all its examples`))
  }
  const stale = Object.values(run.stale).reduce((sum, n) => sum + n, 0)
  if (stale > 0) {
    yield* Console.log(c.yellow(`stale: ${stale} earlier result(s) no longer count (${describe(run.stale)}); run them again`))
  }
  if (module) {
    yield* Console.log(`\nStep definitions for the undefined steps:\n\n${module}`)
  } else if (snippets.length > 0) {
    yield* Console.log(c.dim("undefined steps describe behaviour not automated yet; --snippets prints a step definition module for them"))
  }
})

/** Targets that are paths relative to the current directory, made relative to the workspace root. */
const fromHere = Effect.fnUntraced(function*(root: string, targets: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const cwd = process.cwd()
  if (cwd === root) return targets
  return yield* Effect.forEach(targets, (target) =>
    Effect.map(fs.exists(path.resolve(cwd, target)), (exists) => {
      const inside = path.relative(root, path.resolve(cwd, target))
      return exists && !inside.startsWith("..") && !path.isAbsolute(inside) ? inside || "." : target
    }))
})

const runCommand = Command.make(
  "run",
  {
    targets: Argument.String("targets").pipe(
      Argument.withDescription("Spec ids, scenario ids, files or directories (default: everything)"),
      Argument.variadic()
    ),
    tags: Flag.String("tags").pipe(Flag.withDescription("Cucumber tag expression, e.g. '@nfr and not @slow'"), Flag.optional),
    snippets: Flag.Boolean("snippets").pipe(
      Flag.withDescription("Print one step definition module with a suggested definition for every undefined step"),
      Flag.withDefault(false)
    ),
    concurrency: Flag.Int("concurrency").pipe(
      Flag.withDescription("Scenarios to run at once (scenarios tagged @serial always run alone)"),
      Flag.withDefault(1)
    ),
    verbose: Flag.Boolean("verbose").pipe(Flag.withDescription("Show passed steps too"), Flag.withDefault(false)),
    json
  },
  Effect.fn(function*(input) {
    yield* executeRun({ ...input, enforceGates: false })
  })
).pipe(Command.withDescription("Execute scenarios and record results (.sdp/results.json)"))

const gateCommand = Command.make(
  "gate",
  { milestone: Argument.String("milestone").pipe(Argument.withDescription("Milestone id, e.g. MS-beta")), json },
  Effect.fn(function*({ json, milestone }) {
    const project = yield* loadProject(yield* workspaceRoot)
    yield* ensureReadable(project)
    const node = project.graph.node(milestone)
    if (!node) return yield* fail(`no node ${milestone}`)
    const spec = project.specById.get(milestone)
    if (!spec?.scenarios.some((scenario) => isGate(scenario, spec))) {
      return yield* fail(`${milestone} has no gate scenarios: gates are the scenarios of milestones and scenarios tagged @gate`)
    }
    if (!json) yield* Console.log(`${c.bold(node.id)} ${node.title}`)
    yield* executeRun({ targets: [milestone], tags: Option.none(), json, snippets: false, verbose: false, enforceGates: true })
  })
).pipe(Command.withDescription("Evaluate a milestone's gate scenarios against the current graph"))

// --- arch / lifecycle / status ----------------------------------------------

const archCommand = Command.make(
  "arch",
  {
    format: Flag.Literals("format", ["text", "mermaid", "dot", "json"]).pipe(
      Flag.withAlias("f"),
      Flag.withDescription("Output format"),
      Flag.withDefault("text")
    ),
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
      return yield* printJson(architectureJson(project))
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
          iterations: p.iterations.map((i) => i.node.id)
        })),
        // Planned activity per discipline, one number per iteration in `iterations` order.
        disciplines: Object.fromEntries(report.disciplines.map((d) => [d.discipline, d.activity])),
        iterations: report.iterations.map((i) => i.id),
        // Per iteration, also those in no phase: the planned work, and the evidence apart from it.
        work: report.work.map((i) => ({
          ...nodeJson(i.node),
          items: i.items.map((n) => n.id),
          evidence: { stages: i.stages, scenarios: i.scenarios }
        })),
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
    const line = (label: string, m: Record<string, number>, order?: ReadonlyArray<string>, none = "—") => {
      const keys = order ? [...order.filter((k) => k in m), ...Object.keys(m).filter((k) => !order.includes(k))] : Object.keys(m)
      return `${c.bold(label.padEnd(13))} ${keys.map((k) => `${k} ${m[k]}`).join(" · ") || none}`
    }
    const results = ["passed", "failed", "pending", "undefined", "unrun", "stale"]
    yield* Console.log(`${c.bold("graph".padEnd(13))} ${summary.nodes} nodes, ${summary.edges} edges, ${summary.specFiles} spec files`)
    yield* Console.log(line("kinds", summary.kinds))
    yield* Console.log(line("relations", summary.relations))
    yield* Console.log(line("spec stages", summary.stages, stageOrder))
    yield* Console.log(line("decisions", summary.decisions))
    yield* Console.log(line("scenarios", summary.scenarios, results))
    yield* Console.log(line("gates", summary.gates, results))
    if (Object.keys(summary.stale).length > 0) yield* Console.log(`${line("stale", summary.stale)}  ${c.dim("(sdp run refreshes them)")}`)
    yield* Console.log(
      `${c.bold("architecture".padEnd(13))} ${summary.architecture.significant} significant · ${summary.architecture.declared} declared, not significant`
    )
    yield* Console.log(line("check", summary.diagnostics, ["error", "warning", "info"], "no diagnostics"))
  })
).pipe(Command.withDescription("One-screen summary of the delivery state"))

// --- authoring --------------------------------------------------------------

const newCommand = Command.make(
  "new",
  {
    kind: Argument.String("kind").pipe(
      Argument.withDescription(
        `What to create. With a template of its own: ${templateKinds.join(", ")} (idea: a requirement at maturity idea, in specs/ideas). Any other kind gets the generic template`
      )
    ),
    title: Argument.String("title").pipe(Argument.withDescription("Title; the id is made from it (decisions and risks are numbered)")),
    id: Flag.String("id").pipe(Flag.withDescription("Use this id instead of one made from the title"), Flag.optional),
    maturity: Flag.String("maturity").pipe(
      Flag.withDescription("Start at this maturity — idea (default), draft, specified or ready, or your configured ladder; the template grows with it"),
      Flag.optional
    ),
    dir: Flag.String("dir").pipe(
      Flag.withDescription("Directory to write to, relative to the workspace root or absolute (default depends on kind)"),
      Flag.optional
    )
  },
  Effect.fn(function*({ dir, id, kind, maturity, title }) {
    const root = yield* workspaceRoot
    const project = yield* loadProject(root, { withResults: false })
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const ladder = project.config.maturity
    if (Option.isSome(maturity) && !ladder.includes(maturity.value)) {
      return yield* fail(`unknown maturity ${maturity.value}: use one of ${ladder.join(", ")}`)
    }
    const created = newSpec({
      kind,
      title,
      maturity: Option.getOrUndefined(maturity),
      today: DateTime.formatIsoDate(yield* DateTime.now),
      config: project.config,
      existing: [...project.graph.nodes.keys()],
      id: Option.getOrUndefined(id),
      dir: Option.getOrUndefined(dir)
    })
    // An id only a dangling link names is waiting for exactly this node.
    const existing = project.graph.node(created.id)
    if (existing && existing.kind !== "missing") return yield* fail(`id ${created.id} already exists at ${formatSource(existing.source)}`)
    const target = path.resolve(root, created.file)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true })
    // Compared as real paths: an absolute --dir may reach the workspace through a symbolic link.
    const relative = path.relative(yield* fs.realPath(root), path.join(yield* fs.realPath(path.dirname(target)), path.basename(target)))
    const inside = !relative.startsWith("..") && !path.isAbsolute(relative)
    const shown = inside ? relative : target
    if (yield* fs.exists(target)) return yield* fail(`${shown} already exists`)
    yield* fs.writeFileString(target, created.content)
    yield* Console.log(`${created.id}\t${shown}`)
    if (!inside) yield* Console.error(c.yellow(`note: ${shown} is outside the workspace ${root}, so it is not part of its graph`))
  })
).pipe(
  Command.withDescription(
    `Create a spec, decision, element, plan, ... from a template and print its id and file. Templates: ${templateKinds.join(", ")}`
  ),
  Command.withExamples([
    { command: "sdp new requirement 'Saved carts' --maturity draft", description: "A requirement with a description to write" },
    { command: "sdp new idea 'Gift wrapping'", description: "A one-line idea in specs/ideas" },
    { command: "sdp new plan 'Delivery plan'", description: "Phases with an example iteration each" },
    { command: "sdp new decision 'Use Postgres for orders'", description: "A numbered decision record" }
  ])
)

const initCommand = Command.make(
  "init",
  {},
  Effect.fn(function*() {
    // A new workspace starts here (or at -C), never in a workspace further up.
    const { root: given } = yield* sdp
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = path.resolve(Option.getOrElse(given, () => "."))
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
    yield* Console.log(
      c.dim("next: sdp new idea \"My first idea\"  ·  sdp new plan \"Delivery plan\"  ·  point your AGENTS.md or CLAUDE.md at AGENTS.sdp.md")
    )
  })
).pipe(Command.withDescription("Create sdp.config.yaml and an agent guide (AGENTS.sdp.md, itself a spec) in the workspace"))

const typesCommand = Command.make(
  "types",
  {},
  Effect.fn(function*() {
    const root = yield* workspaceRoot
    const project = yield* loadProject(root, { withResults: false })
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = path.join(root, project.config.types)
    const declaration = idsDeclaration(project)
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, declaration)
    const count = declaration.split("\n").filter((line) => line.startsWith("    \"")).length
    yield* Console.log(`wrote ${project.config.types} (${count} ids): annotate() now accepts exactly these`)
  })
).pipe(Command.withDescription("Write the id declarations that type annotate() in TypeScript (sdp/annotations)"))

const mcpCommand = Command.make(
  "mcp",
  {},
  Effect.fn(function*() {
    // Loaded on demand: only `sdp mcp` needs the MCP stack.
    const { serveMcp } = yield* Effect.promise(() => import("../mcp/Server.ts"))
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
    typesCommand,
    mcpCommand
  ]),
  Command.run({ version: "0.1.0" }),
  // Problems with the user's files are reported as one line naming the file, not as a stack trace.
  Effect.catchTags({
    ConfigError: (e) => fail(`${e.file}: invalid configuration: ${e.message.replace(/\s*\n\s*/g, " ")}`),
    StepLoadError: (e) => fail(`${e.file}: could not load step definitions: ${e.message}`),
    UnknownTargets: (e) => fail(e.message),
    UnreadableSpecs: (e) => fail(e.message),
    WorkspaceNotFound: (e) => fail(e.message),
    PlatformError: (e) => fail(e.message)
  }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
