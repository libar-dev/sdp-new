/**
 * MCP server exposing the graph to AI agents. A thin transport: each tool
 * checks its arguments, calls one use case of the application layer
 * (`src/app/`) — the one the command line calls for the same question — and
 * returns the answer as text, or as the JSON envelope when asked. Every call
 * reads the workspace again, so agents always see the files as they are now,
 * and no tool runs workspace code.
 */
import { annotate } from "sdp/annotations"
import { NodeStdio } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import type { Answer } from "../app/Answer.ts"
import { type AppError, describe } from "../app/Errors.ts"
import * as Reading from "../app/Reading.ts"
import { relationVocabulary } from "../app/Templates.ts"
import * as Text from "../app/Text.ts"
import { querySyntax } from "../graph/Query.ts"

annotate(import.meta, { is: "ARCH-mcp" })

const queryHelp = `SDPQ path patterns, one line:\n${querySyntax}`

/** A tool failure the agent should read: delivered as an MCP tool error whose text is the message. */
class SdpToolError extends Schema.TaggedError<SdpToolError>()("SdpToolError", { message: Schema.String }) {}

const text = { success: Schema.String, failure: SdpToolError, failureMode: "error" as const }

const json = Schema.optional(Schema.Boolean).annotate({
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
    "Summary counts: node kinds, relations in use, stages, decision statuses, scenario and gate results, architectural nodes, diagnostics.",
  parameters: Schema.Struct({ json }),
  ...text
}))

const SdpQuery = readOnly(Tool.make("sdp_query", {
  description:
    `Query the system graph (specs, decisions, architecture, scenarios, code links). Answers with one node per line: id, kind, status or stage, title, file:line, separated by tabs.\n${queryHelp}`,
  parameters: Schema.Struct({
    expression: Schema.String.annotate({ description: "SDPQ expression" }),
    paths: Schema.optional(Schema.Boolean).annotate({ description: "Answer with the paths that led to the nodes, one per line" }),
    json
  }),
  ...text
}))

const SdpShow = readOnly(Tool.make("sdp_show", {
  description: "One node: its attributes, where it is declared, its outgoing and incoming edges.",
  parameters: Schema.Struct({ id: Schema.String, json }),
  ...text
}))

const SdpContext = readOnly(Tool.make("sdp_context", {
  description:
    "Everything needed to work on one node, as Markdown: the spec text, why it is not ready yet, relationships, scenario status with the step definitions still to write (no run needed), architecture, quality requirements with their measures and decisions in reach, linked code.",
  parameters: Schema.Struct({
    id: Schema.String,
    depth: Schema.optional(Schema.Int).annotate({ description: "Hops to search for architecture and decisions, 1 to 6 (default 2)" })
  }),
  ...text
}))

const SdpSteps = readOnly(Tool.make("sdp_steps", {
  description:
    "The step definitions a run would know, sdp's built-in ones included, one per line: file:line, keyword, expression. Ask before writing a step definition: extend one that exists instead of adding a near-duplicate. Read from the step files without running them.",
  parameters: Schema.Struct({
    text: Schema.optional(Schema.String).annotate({
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
  description: "Validate the workspace: dangling links, maturity gates, decision hygiene. Each diagnostic has a rule, a file:line and a hint.",
  parameters: Schema.Struct({
    severity: Schema.optional(Schema.Literals(["error", "warning", "info"])).annotate({ description: "Minimum severity (default info: everything)" }),
    json
  }),
  ...text
}))

const SdpArchitecture = readOnly(Tool.make("sdp_architecture", {
  description:
    "The architecture: every element and pattern architects declared, their relationships, and the decisions and quality requirements linked to them. Use before designing a change.",
  parameters: Schema.Struct({ json }),
  ...text
}))

const SdpLifecycle = readOnly(Tool.make("sdp_lifecycle", {
  description:
    "The delivery plan: phases with their milestone gates, iterations with their planned work by stage, and discipline activity per iteration.",
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
      sdp_check: ({ json, severity }) => reply(Reading.check(root, { severity }), json, Text.diagnostics),
      sdp_architecture: ({ json }) => reply(Reading.architecture(root), json, Text.architecture),
      sdp_lifecycle: ({ json }) => json ? reply(Reading.lifecycle(root), true, () => "") : reply(Reading.lifecycleChart(root), false, document)
    })
  }))

/** The tool registrations, for stdio serving and in-memory tests (McpTest.makeClient). */
export const registrations = (root: string) => McpServer.toolkit(SdpToolkit).pipe(Layer.provide(handlers(root)))

export const instructions =
  `sdp exposes a software delivery graph: specs (requirements, quality requirements, ideas) at any maturity, decision records, curated architecture (the elements and patterns architects declared), lifecycle (phases, iterations, milestones), scenarios with execution status, and the code linked to them. TypeScript and JavaScript link code with typed calls, \`annotate(target, { implements: "REQ-x" })\` imported from "sdp/annotations", whose ids the compiler checks once \`sdp types\` has run; other languages use comment lines, \`// @sdp implements REQ-x\`. Start with sdp_status, then sdp_query; use sdp_context before working on a spec, sdp_snippets to automate its scenarios and sdp_steps to find a step definition to extend. An answer that starts with "incomplete:" was given from a workspace sdp could not fully read: its notes say what is missing, so do not conclude that something is absent. Relations are free-form; sdp's templates use ${relationVocabulary}. Source files are Markdown with YAML front matter — you can also grep them directly.`

export const serveMcp = (root: string) =>
  Layer.launch(
    McpServer.layerStdio({
      name: "sdp",
      version: "0.1.0",
      instructions,
      protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18, McpProtocol.v2025_03_26],
      registrations: registrations(root)
    }).pipe(Layer.provide(NodeStdio.layer))
  )
