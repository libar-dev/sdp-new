/**
 * MCP server exposing the graph to AI agents. A thin transport: each tool
 * checks its arguments, calls one use case of the application layer
 * (`src/app/`) — the one the command line calls for the same question — and
 * returns the answer as text, or as the JSON envelope when asked. Every call
 * reads the workspace again, so agents always see the files as they are now,
 * and no tool runs workspace code.
 *
 * @sdp is ARCH-mcp
 */
import { NodeStdio } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import type { Answer } from "../app/Answer.ts"
import { type AppError, describe } from "../app/Errors.ts"
import * as Reading from "../app/Reading.ts"
import { relationVocabulary } from "../app/Templates.ts"
import * as Text from "../app/Text.ts"
import { querySyntax } from "../graph/Query.ts"
import { Severity } from "../model/Diagnostic.ts"
const queryHelp = `SDPQ path patterns, one line:\n${querySyntax}`

/** A tool failure the agent should read: delivered as an MCP tool error whose text is the message. */
class SdpToolError extends Schema.TaggedError<SdpToolError>()("SdpToolError", { message: Schema.String }) {}

const text = { success: Schema.String, failure: SdpToolError, failureMode: "error" as const }

const json = Schema.optionalKey(Schema.Boolean).annotate({
  description: "Answer as JSON instead of text: { complete, notes, data }, as the command line prints with --json"
})

/**
 * Every tool only reads the workspace's files — none imports or runs its code — and asking twice
 * gives the same answer. Strict tools reject arguments they do not know, so a misspelt one is an
 * error instead of being silently ignored.
 */
const readOnly = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.OpenWorld, false)
    .annotate(Tool.Strict, true) as T

const SdpStatus = readOnly(Tool.make("sdp_status", {
  description:
    "Summary counts: node kinds, relations in use, stages, scenario and gate results, milestones met and open, architectural nodes, diagnostics.",
  parameters: Schema.Struct({ json }),
  ...text
}))

const SdpQuery = readOnly(Tool.make("sdp_query", {
  description:
    `Query the system graph (specs, decisions, architecture, scenarios, code links). Answers with one node per line: id, kind, status or stage, title, file:line, separated by tabs.\n${queryHelp}`,
  parameters: Schema.Struct({
    expression: Schema.String.annotate({ description: "SDPQ expression" }),
    paths: Schema.optionalKey(Schema.Boolean).annotate({ description: "Answer with the paths that led to the nodes, one per line" }),
    json
  }),
  ...text
}))

const SdpShow = readOnly(Tool.make("sdp_show", {
  description: "One node: its attributes, where it is declared, its outgoing and incoming edges.",
  parameters: Schema.Struct({ id: Schema.String.annotate({ description: "Id of the node to read" }), json }),
  ...text
}))

const SdpContext = readOnly(Tool.make("sdp_context", {
  description:
    "Everything needed to work on one node, as Markdown: its rules with their state and reason, its scenarios with their status and the step definitions still to write (no run needed), the rest of the spec as written, relationships, architecture, quality requirements with their measures and decisions in reach, linked code.",
  parameters: Schema.Struct({
    id: Schema.String.annotate({ description: "Id of the node to read" }),
    depth: Schema.optionalKey(Schema.Int).annotate({ description: "Hops to search for architecture, quality requirements and decisions, 1 to 6 (default 2)" })
  }),
  ...text
}))

const SdpSteps = readOnly(Tool.make("sdp_steps", {
  description:
    "The step definitions a run would know, sdp's built-in ones included, one per line: file:line, keyword, expression. Ask before writing a step definition: extend one that exists instead of adding a near-duplicate. Read from the step files without running them.",
  parameters: Schema.Struct({
    text: Schema.optionalKey(Schema.String).annotate({
      description: "Only definitions whose expression contains this text, or that match it as a step"
    }),
    json
  }),
  ...text
}))

const SdpSnippets = readOnly(Tool.make("sdp_snippets", {
  description:
    "The steps of one spec's scenarios that no step definition matches yet (or more than one), and a step definition module with a suggested definition for each, ready to save as a .steps.ts file. Step definitions are read from the step files without running them.",
  parameters: Schema.Struct({ id: Schema.String.annotate({ description: "Spec id" }) }),
  ...text
}))

const SdpCheck = readOnly(Tool.make("sdp_check", {
  description: "Validate the workspace: tags, links, Gherkin, that every live rule has an example and nothing live at the git base stopped being live, the shape of decisions and the plan. Each diagnostic has a rule, a file:line and a hint.",
  parameters: Schema.Struct({
    severity: Schema.optionalKey(Severity).annotate({ description: "Minimum severity (default info: everything)" }),
    base: Schema.optionalKey(Schema.String).annotate({
      description: "The git revision to compare live tests with, where HEAD meets it (default: the configuration's base, else the default branch)"
    }),
    json
  }),
  ...text
}))

const SdpArchitecture = readOnly(Tool.make("sdp_architecture", {
  description:
    "The architecture: every element and pattern architects declared, their relationships, and the decisions and quality requirements that shaped them, linked to them or to the features they realize. Use before designing a change.",
  parameters: Schema.Struct({ json }),
  ...text
}))

const SdpLifecycle = readOnly(Tool.make("sdp_lifecycle", {
  description:
    "The delivery plan: the milestones with what each closes, its gate and whether it is met — the first that is not is where the project is — the iterations with their planned work by stage, and discipline activity per iteration.",
  parameters: Schema.Struct({ json }),
  ...text
}))

export const SdpToolkit = Toolkit.make(
  SdpStatus,
  SdpQuery,
  SdpShow,
  SdpContext,
  SdpSteps,
  SdpSnippets,
  SdpCheck,
  SdpArchitecture,
  SdpLifecycle
)

/** A use case's failure as a tool error the agent can act on; a malformed query comes with the syntax. */
const toolError = (error: AppError) =>
  new SdpToolError({ message: error._tag === "QueryError" ? `${describe(error)}\n\n${queryHelp}` : describe(error) })

const handlers = (root: string) =>
  SdpToolkit.toLayer(Effect.gen(function*() {
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
    /**
     * An answer as the tool's reply: the JSON envelope when asked, else its data as text, preceded
     * by what the reader should know about it — a tool has no stderr and no exit code to say so.
     */
    const reply = <A, E extends AppError>(
      asked: Effect.Effect<Answer<A>, E, FileSystem.FileSystem | Path.Path>,
      asJson: boolean | undefined,
      render: (data: A) => string
    ) =>
      asked.pipe(
        Effect.map((answer) =>
          asJson ? JSON.stringify(answer, null, 2) : [...Text.remarks(answer), render(answer.data) || "nothing"].join("\n")
        ),
        Effect.mapError(toolError),
        Effect.provide(services)
      )
    const document = (text: string) => text
    return SdpToolkit.of({
      sdp_status: ({ json }) => reply(Reading.status(root), json, Text.status),
      sdp_query: ({ expression, json, paths }) => reply(Reading.query(root, { expression, paths }), json, Text.query),
      sdp_show: ({ id, json }) => reply(Reading.show(root, { id }), json, Text.show),
      sdp_context: ({ depth, id }) => reply(Reading.context(root, { id, depth }), false, document),
      sdp_steps: ({ json, text }) => reply(Reading.steps(root, { text }), json, Text.steps),
      sdp_snippets: ({ id }) => reply(Reading.snippets(root, { id }), false, document),
      sdp_check: ({ base, json, severity }) => reply(Reading.check(root, { severity, base }), json, Text.diagnostics),
      sdp_architecture: ({ json }) => reply(Reading.architecture(root), json, Text.architecture),
      sdp_lifecycle: ({ json }) => json ? reply(Reading.lifecycle(root), true, () => "") : reply(Reading.lifecycleChart(root), false, document)
    })
  }))

/** The tool registrations, for stdio serving and in-memory tests (McpTest.makeClient). */
export const registrations = (root: string) => McpServer.toolkit(SdpToolkit).pipe(Layer.provide(handlers(root)))

export const instructions = [
  "sdp exposes a software delivery graph: features, decisions, the curated architecture, the delivery plan, the scenarios with what they did when they last ran, and the code anchored to the architecture.",
  "A feature's requirements, quality ones included, are its rules, and its scenarios are their examples. A feature or a rule declares a maturity while it is still to come; once it is built it declares none and is live, and its examples must pass.",
  "The architecture is the elements and patterns architects declared; the plan is milestones, phases and iterations.",
  "Start with sdp_status, then sdp_query; use sdp_context before working on a spec, sdp_snippets to automate its scenarios and sdp_steps to find a step definition to extend.",
  "An answer that starts with \"incomplete:\" may miss something — a file sdp could not read, an import it could not follow, a question cut short: its notes say what, so do not conclude that something is absent.",
  "Code links to the architecture, not to features. A tag in the doc comment of a declaration, `@sdp is ARCH-orders`, says which code an element is, in every language; in the comment that opens a file, it says the file is, and the rest of the comment describes it. A feature names its element with `realized-by`, so the way from a feature to its code is `feature -realized-by-> element <-is- code`.",
  "What belongs in the architecture is the architects' call: propose an element, a pattern or an `is` annotation, do not add or remove one yourself.",
  `Relations are free-form; sdp's templates use ${relationVocabulary}.`,
  "A spec is a Gherkin file: `@id=guest-checkout @maturity=ready` above `Feature:` says what it is, `@decided-by:accounts-are-optional` what it links to, a `Rule:` what must hold and its scenarios the examples — you can also grep them directly.",
  "An id names what it is: one with no prefix is a feature's, a decision says its kind with `@kind=`, and elements, patterns, milestones, phases and iterations keep their prefix, as in `ARCH-orders` or `IT-beta`."
].join(" ")

/** Serves the workspace at `root` over stdio, as `version` of sdp. */
export const serveMcp = (root: string, version: string) =>
  Layer.launch(
    McpServer.layerStdio({
      name: "sdp",
      version,
      instructions,
      protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18, McpProtocol.v2025_03_26],
      registrations: registrations(root)
    }).pipe(Layer.provide(NodeStdio.layer))
  )
