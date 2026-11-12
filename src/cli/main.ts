/**
 * `sdp` — the command line. A thin transport: each command parses its flags,
 * calls one use case of the application layer (`src/app/`) and prints the
 * answer — as text by default, as the JSON envelope with `--json`. Notes go to
 * stderr, and an incomplete answer exits with 2 (REQ-cli).
 */
// Subpath imports: the package index loads every Node service (HTTP, sockets, …) and slows every start.
import { annotate } from "sdp/annotations"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Console, Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import type { Answer } from "../app/Answer.ts"
import * as Authoring from "../app/Authoring.ts"
import { describe, Refused } from "../app/Errors.ts"
import * as Reading from "../app/Reading.ts"
import * as Running from "../app/Running.ts"
import { templateKinds } from "../app/Templates.ts"
import * as Text from "../app/Text.ts"
import { jsonLines } from "../graph/Export.ts"
import { querySyntax } from "../graph/Query.ts"
import type { ScenarioResult } from "../model/Results.ts"
import { findWorkspaceRoot } from "../workspace/Workspace.ts"

annotate(import.meta, { is: "ARCH-cli" })

// `sdp … | head` closes the pipe early; that is the reader's choice, not an error.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(process.exitCode ?? 0)
  throw error
})

const json = Flag.Boolean("json").pipe(
  Flag.withDescription("Print the answer as JSON: { complete, notes, data }"),
  Flag.withDefault(false)
)

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

/** The directory `-C` names, if it was given. One that does not exist yet is for the command to report, or to make. */
const givenRoot = Effect.gen(function*() {
  const { root } = yield* sdp
  if (Option.isNone(root)) return undefined
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.resolve(root.value)
  const isDirectory = yield* fs.stat(directory).pipe(Effect.map((info) => info.type === "Directory"), Effect.orElseSucceed(() => true))
  return isDirectory ? directory : yield* new Refused({ reason: `-C ${root.value}: a workspace is a directory, and this is a file` })
})

/** `-C <dir>`, or the nearest directory with a configuration file, the way git finds its repository. */
const workspaceRoot = Effect.gen(function*() {
  return (yield* givenRoot) ?? (yield* findWorkspaceRoot(process.cwd()))
})

/** The command did not do what it was asked: a check with errors, a failed scenario, input it refuses. */
const failed = 1
/** The command answered, but from a workspace it could not fully read or a search it could not finish. */
const incomplete = 2

const fail = (message: string) =>
  Effect.gen(function*() {
    yield* Console.error(Text.c.red(message))
    process.exitCode = failed
  })

/**
 * Prints an answer: its data as text — or, with `--json`, the envelope — on stdout, so the lines
 * stay clean for a pipe, and what the reader should know about it on stderr. An incomplete answer
 * exits with 2 whatever the output mode, unless the command already failed.
 */
const print = Effect.fnUntraced(function*<A>(answer: Answer<A>, asJson: boolean, text: (data: A) => string) {
  const body = asJson ? JSON.stringify(answer, null, 2) : text(answer.data)
  if (body !== "") yield* Console.log(body)
  for (const remark of Text.remarks(answer)) yield* Console.error(Text.c.yellow(remark))
  if (!answer.complete) process.exitCode ||= incomplete
})

// --- reading the graph ------------------------------------------------------

const statusCommand = Command.make(
  "status",
  { json },
  Effect.fn(function*({ json }) {
    yield* print(yield* Reading.status(yield* workspaceRoot), json, Text.status)
  })
).pipe(Command.withDescription("One-screen summary of the delivery state"))

const queryCommand = Command.make(
  "query",
  {
    expression: Argument.String("expression").pipe(Argument.withDescription("SDPQ, e.g. 'requirement[maturity=ready] -realized-by-> *'")),
    paths: Flag.Boolean("paths").pipe(Flag.withDescription("Print the paths that led to the nodes, one per line"), Flag.withDefault(false)),
    ids: Flag.Boolean("ids").pipe(Flag.withDescription("Print only ids, one per line"), Flag.withDefault(false)),
    json
  },
  Effect.fn(function*({ expression, ids, json, paths }) {
    const found = yield* Reading.query(yield* workspaceRoot, { expression, paths })
    yield* print(found, json, (data) => ids ? data.nodes.map((node) => node.id).join("\n") : Text.query(data))
    if (!ids && !json) yield* Console.error(Text.c.dim(`${found.data.nodes.length} node(s)`))
  })
).pipe(
  Command.withAlias("q"),
  Command.withShortDescription("Query the graph with a path pattern"),
  Command.withDescription(`Query the graph with a path pattern (SDPQ):\n\n${querySyntax.replace(/^/gm, "  ")}`),
  Command.withExamples([
    { command: "sdp q 'requirement[maturity<ready]'", description: "Requirements not ready yet" },
    { command: "sdp q 'element !-*- decision'", description: "Elements without a decision" },
    { command: "sdp q '#DEC-0002 <-*- *' --json | jq -r '.data.nodes[].id'", description: "Everything that points at a decision, as data" }
  ])
)

const id = Argument.String("id").pipe(Argument.withDescription("Node id, e.g. REQ-guest-checkout"))

const showCommand = Command.make(
  "show",
  { id, json },
  Effect.fn(function*({ id, json }) {
    yield* print(yield* Reading.show(yield* workspaceRoot, { id }), json, Text.show)
  })
).pipe(Command.withDescription("Show one node with its attributes and edges"))

const contextCommand = Command.make(
  "context",
  {
    id,
    depth: Flag.Int("depth").pipe(
      Flag.withDescription("Hops to search for architecture, quality requirements and decisions, 1 to 6"),
      Flag.withDefault(2)
    )
  },
  Effect.fn(function*({ depth, id }) {
    yield* print(yield* Reading.context(yield* workspaceRoot, { id, depth }), false, (document) => document)
  })
).pipe(
  Command.withDescription(
    "Markdown context bundle for one node: spec, why it is not ready, links, scenarios with the step definitions still to write, architecture, quality requirements, decisions, code"
  )
)

const select = Flag.String("query").pipe(Flag.withAlias("q"), Flag.withDescription("Only the nodes and edges along the paths this query matches"), Flag.optional)
const mermaid = Flag.Boolean("mermaid").pipe(Flag.withDescription("Print a Mermaid flowchart instead"), Flag.withDefault(false))

const graphCommand = Command.make(
  "graph",
  { select, mermaid },
  Effect.fn(function*({ mermaid, select }) {
    const root = yield* workspaceRoot
    const input = { select: Option.getOrUndefined(select) }
    if (mermaid) return yield* print(yield* Reading.diagram(root, input), false, (diagram) => diagram.trimEnd())
    yield* print(yield* Reading.graph(root, input), false, (records) => jsonLines(records).trimEnd())
  })
).pipe(
  Command.withDescription("The graph as plain data: one JSON record per line, every node and then every edge"),
  Command.withExamples([
    { command: "sdp graph | grep '\"rel\":\"decided-by\"'", description: "Every decided-by edge, with where it is declared" },
    { command: "sdp graph | jq -r 'select(.type == \"node\" and .attrs.maturity == \"ready\") | .id'", description: "The ids of the ready nodes" },
    { command: "sdp graph --mermaid -q 'element -decided-by-> decision'", description: "A diagram of part of the graph" }
  ])
)

const archCommand = Command.make(
  "arch",
  { json, mermaid },
  Effect.fn(function*({ json, mermaid }) {
    const root = yield* workspaceRoot
    if (mermaid) return yield* print(yield* Reading.diagram(root, "architecture"), false, (diagram) => diagram.trimEnd())
    yield* print(yield* Reading.architecture(root), json, Text.architecture)
  })
).pipe(Command.withDescription("The architecture: every element and pattern, with the decisions and quality requirements linked to it"))

const lifecycleCommand = Command.make(
  "lifecycle",
  { json },
  Effect.fn(function*({ json }) {
    const root = yield* workspaceRoot
    if (json) return yield* print(yield* Reading.lifecycle(root), true, () => "")
    yield* print(yield* Reading.lifecycleChart(root), false, (chart) => chart.trimEnd())
  })
).pipe(Command.withDescription("Phases, iterations, milestone gates and discipline activity (RUP view)"))

const vocabularyCommand = Command.make(
  "vocabulary",
  { json },
  Effect.fn(function*({ json }) {
    yield* print(yield* Reading.vocabulary(yield* workspaceRoot), json, Text.vocabulary)
  })
).pipe(Command.withDescription("The words sdp interprets — kinds, relations, attributes, statuses, maturity, disciplines — as configured"))

// --- checking and running ---------------------------------------------------

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
    const found = yield* Reading.check(yield* workspaceRoot, { severity })
    if (found.data.some((diagnostic) => diagnostic.severity === "error")) process.exitCode = failed
    yield* print(found, json, Text.diagnostics)
  })
).pipe(Command.withDescription("Validate front matter, links, Gherkin, maturity criteria and decision records; exit 1 on errors"))

const stepsCommand = Command.make(
  "steps",
  {
    text: Argument.String("text").pipe(
      Argument.withDescription("Only definitions whose expression contains this text, or that match it as a step"),
      Argument.optional
    ),
    json
  },
  Effect.fn(function*({ json, text }) {
    const listed = yield* Reading.steps(yield* workspaceRoot, { text: Option.getOrUndefined(text) })
    yield* print(listed, json, Text.steps)
    if (!json) yield* Console.error(Text.c.dim(`${listed.data.length} step definition(s)`))
  })
).pipe(
  Command.withDescription(
    "List step definitions, built-in ones included, one per line: file:line, keyword, expression. Read from the step files without running them"
  ),
  Command.withExamples([
    { command: "sdp steps", description: "Every step definition" },
    { command: "sdp steps cart", description: "Definitions that mention the cart: extend one instead of adding a near-duplicate" },
    { command: "sdp steps 'the cart holds 3 items'", description: "The definition this step would run" }
  ])
)

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

/** Prints a run: each scenario as its result is known, then the summary; a run that did not pass exits with 1. */
const printRun = Effect.fnUntraced(function*<R extends Running.RunReport, E, S>(
  run: (onScenario: (result: ScenarioResult) => Effect.Effect<void>) => Effect.Effect<Answer<R>, E, S>,
  options: { readonly json: boolean; readonly verbose: boolean }
) {
  const ran = yield* run((result) => options.json ? Effect.void : Console.log(Text.scenario(result, options)))
  if (!ran.data.passed) process.exitCode = failed
  yield* print(ran, options.json, Text.runSummary)
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
  Effect.fn(function*({ concurrency, json, snippets, tags, targets, verbose }) {
    const root = yield* workspaceRoot
    const input = { targets: yield* fromHere(root, targets), tags: Option.getOrUndefined(tags), snippets, concurrency }
    yield* printRun((onScenario) => Running.run(root, { ...input, onScenario }), { json, verbose })
  })
).pipe(Command.withDescription("Execute scenarios and record results (.sdp/results.json)"))

const gateCommand = Command.make(
  "gate",
  {
    milestone: Argument.String("milestone").pipe(Argument.withDescription("Milestone id, e.g. MS-beta, or a spec with @gate scenarios")),
    json
  },
  Effect.fn(function*({ json, milestone }) {
    const root = yield* workspaceRoot
    yield* printRun((onScenario) => Running.gate(root, { milestone, onScenario }), { json, verbose: false })
  })
).pipe(
  Command.withDescription("Evaluate one milestone's gate scenarios against the current graph; exit 0 only when every one of them passed"),
  Command.withExamples([{ command: "sdp gate MS-beta", description: "Does this milestone's gate pass?" }])
)

// --- authoring --------------------------------------------------------------

const newCommand = Command.make(
  "new",
  {
    kind: Argument.String("kind").pipe(
      Argument.withDescription(
        `What to create. With a template of its own: ${templateKinds.join(", ")} (idea: a requirement at maturity idea). Any other kind gets the generic template`
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
    const created = yield* Authoring.create(root, {
      kind,
      title,
      id: Option.getOrUndefined(id),
      maturity: Option.getOrUndefined(maturity),
      dir: Option.getOrUndefined(dir)
    })
    yield* Console.log(`${created.id}\t${created.file}`)
    if (!created.inside) {
      yield* Console.error(Text.c.yellow(`note: ${created.file} is outside the workspace ${root}, so it is not part of its graph`))
    }
  })
).pipe(
  Command.withDescription(
    `Create a spec, decision, element, plan, ... from a template and print its id and file. Templates: ${templateKinds.join(", ")}`
  ),
  Command.withExamples([
    { command: "sdp new requirement 'Saved carts' --maturity draft", description: "A requirement with a description to write" },
    { command: "sdp new idea 'Gift wrapping'", description: "A one-line idea: a requirement at maturity idea" },
    { command: "sdp new plan 'Delivery plan'", description: "Phases with an example iteration each" },
    { command: "sdp new decision 'Use Postgres for orders'", description: "A numbered decision record" }
  ])
)

const initCommand = Command.make(
  "init",
  {},
  Effect.fn(function*() {
    // A new workspace starts here (or at -C), never in a workspace further up.
    const path = yield* Path.Path
    for (const { created, file } of yield* Authoring.init((yield* givenRoot) ?? path.resolve("."))) {
      yield* Console.log(created ? `created ${file}` : Text.c.dim(`exists  ${file}`))
    }
    yield* Console.log(
      Text.c.dim("next: sdp new idea \"My first idea\"  ·  sdp new plan \"Delivery plan\"  ·  point your AGENTS.md or CLAUDE.md at AGENTS.sdp.md")
    )
  })
).pipe(Command.withDescription("Create sdp.config.yaml and an agent guide (AGENTS.sdp.md, itself a spec) in the workspace"))

const typesCommand = Command.make(
  "types",
  {},
  Effect.fn(function*() {
    const written = yield* Authoring.types(yield* workspaceRoot)
    yield* Console.log(`wrote ${written.file} (${written.ids} ids): annotate() now accepts exactly these`)
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
    stepsCommand,
    archCommand,
    lifecycleCommand,
    vocabularyCommand,
    typesCommand,
    mcpCommand
  ]),
  Command.run({ version: "0.1.0" }),
  // A problem with the user's files or input is one line that names it, not a stack trace.
  Effect.catchTags({
    ConfigError: (e) => fail(describe(e)),
    StepLoadError: (e) => fail(describe(e)),
    SourcesChanged: (e) => fail(describe(e)),
    InvalidStepExpressions: (e) => fail(describe(e)),
    InvalidTags: (e) => fail(describe(e)),
    ResultsLocked: (e) => fail(describe(e)),
    UnknownTargets: (e) => fail(describe(e)),
    UnreadableSpecs: (e) => fail(describe(e)),
    WorkspaceNotFound: (e) => fail(describe(e)),
    QueryError: (e) => fail(describe(e)),
    UnknownNode: (e) => fail(describe(e)),
    Refused: (e) => fail(describe(e)),
    PlatformError: (e) => fail(describe(e))
  }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
