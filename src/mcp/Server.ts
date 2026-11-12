/**
 * MCP server exposing the graph to AI agents. Every call reads the workspace
 * again, so agents always see the files as they are now, including edits they
 * just made. No tool runs workspace code: step definitions are read from the
 * step files, never imported.
 */
import { annotate } from "sdp/annotations"
import { NodeStdio } from "@effect/platform-node"
import { DateTime, Effect, FileSystem, Layer, Path, Result, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import { architectureJson } from "../arch/Architecture.ts"
import { check } from "../check/Check.ts"
import { relationVocabulary } from "../cli/templates.ts"
import type { Project } from "../graph/Build.ts"
import { type ContextSteps, contextBundle } from "../graph/Context.ts"
import { nodeJson, statusCell } from "../graph/Export.ts"
import { formatPath, queryProject, querySyntax, unusedNamesNote } from "../graph/Query.ts"
import { statusSummary } from "../graph/Status.ts"
import { lifecycle, renderLifecycle } from "../lifecycle/Lifecycle.ts"
import { atLeast } from "../model/Diagnostic.ts"
import { formatSource } from "../model/Graph.ts"
import { makeMatcher, snippetModule, stepDefinitions, unmatchedSteps } from "../run/Match.ts"
import { loadProject } from "../workspace/Workspace.ts"

annotate(import.meta, { is: "ARCH-mcp" })

const queryHelp = `SDPQ path patterns, one line:\n${querySyntax}`

/** A tool failure the agent should read: delivered as an MCP tool error whose text is the message. */
class SdpToolError extends Schema.TaggedError<SdpToolError>()("SdpToolError", { message: Schema.String }) {}

const toolError = (message: string) => Effect.fail(new SdpToolError({ message }))

const text = { success: Schema.String, failure: SdpToolError, failureMode: "error" as const }

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

const SdpQuery = readOnly(Tool.make("sdp_query", {
  description: `Query the system graph (specs, decisions, architecture, scenarios, code links).\n${queryHelp}`,
  parameters: Schema.Struct({
    expression: Schema.String.annotate({ description: "SDPQ expression" }),
    paths: Schema.optional(Schema.Boolean).annotate({ description: "Return matched paths instead of end nodes" })
  }),
  ...text
}))

const SdpShow = readOnly(Tool.make("sdp_show", {
  description: "One node as JSON: attributes, source file:line, incoming and outgoing edges.",
  parameters: Schema.Struct({ id: Schema.String }),
  ...text
}))

const SdpContext = readOnly(Tool.make("sdp_context", {
  description:
    "Everything needed to work on one node, as Markdown: the spec text, why it is not ready yet, relationships, scenario status with the step definitions still to write (no run needed), significant architecture, patterns, quality requirements with their measures and decisions in reach, linked code.",
  parameters: Schema.Struct({
    id: Schema.String,
    depth: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 6 }))).annotate({
      description: "Hops to search for architecture and decisions, 1 to 6 (default 2)"
    })
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
  description: "Validate the workspace: dangling links, maturity gates, decision hygiene. Each item has a hint.",
  parameters: Schema.Struct({
    severity: Schema.optional(Schema.Literals(["error", "warning", "info"])).annotate({ description: "Minimum severity (default warning)" })
  }),
  ...text
}))

const SdpArchitecture = readOnly(Tool.make("sdp_architecture", {
  description:
    "The curated architecture only: the elements and patterns architects marked significant (with their rationale), the patterns they apply, and the decisions and quality requirements linked to them. Use before designing a change.",
  ...text
}))

const SdpLifecycle = readOnly(Tool.make("sdp_lifecycle", {
  description:
    "The delivery plan: phases with their milestone gates, iterations with their planned work by stage, and discipline activity per iteration.",
  ...text
}))

const SdpStatus = readOnly(Tool.make("sdp_status", {
  description:
    "Summary counts: node kinds, relations in use, spec stages, decision statuses, scenario and gate results, significant elements, diagnostics.",
  ...text
}))

export const SdpToolkit = Toolkit.make(
  SdpQuery,
  SdpShow,
  SdpContext,
  SdpSnippets,
  SdpCheck,
  SdpArchitecture,
  SdpLifecycle,
  SdpStatus
)

const handlers = (root: string) =>
  SdpToolkit.toLayer(Effect.gen(function*() {
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
    const unreadable = (e: { readonly message: string }) =>
      new SdpToolError({ message: `could not load workspace: ${"file" in e ? `${String(e.file)}: ` : ""}${e.message}` })
    const load = loadProject(root).pipe(Effect.provide(services), Effect.mapError(unreadable))
    // Read from the step files as they are now: nothing is imported, so nothing of the workspace runs.
    const steps = (project: Project): ContextSteps => ({ matcher: makeMatcher(stepDefinitions(project)), files: project.steps.files })
    return SdpToolkit.of({
      sdp_query: ({ expression, paths }) =>
        Effect.flatMap(load, (project) => {
          const result = queryProject(project, expression)
          if (Result.isFailure(result)) return toolError(`query error: ${result.failure.message}\n\n${queryHelp}`)
          const { limits, nodes, truncated } = result.success
          // A result cut short says so first, empty or not: what lies beyond the limit is unknown.
          const cut = truncated ? `, cut short (${limits.join("; ")}): the answer may be incomplete` : ""
          if (nodes.length === 0) {
            const note = unusedNamesNote(project, expression)
            return Effect.succeed([`no matches${cut}`, ...(note ? [note] : [])].join("\n"))
          }
          if (paths) {
            const routes = result.success.paths.map(formatPath)
            return Effect.succeed((truncated ? [`${routes.length} path(s)${cut}`, ...routes] : routes).join("\n"))
          }
          return Effect.succeed(
            [
              `${nodes.length} node(s)${cut}`,
              ...nodes.map((n) => [n.id, n.kind, statusCell(n), n.title, formatSource(n.source)].join("\t"))
            ].join("\n")
          )
        }),
      sdp_show: ({ id }) =>
        Effect.flatMap(load, (project) => {
          const node = project.graph.node(id)
          if (!node) return toolError(`no node ${id}`)
          return Effect.succeed(JSON.stringify({ node: nodeJson(node), out: project.graph.out(id), in: project.graph.in(id) }, null, 2))
        }),
      sdp_context: ({ depth, id }) =>
        Effect.gen(function*() {
          const project = yield* load
          if (!project.graph.node(id)) return yield* toolError(`no node ${id}`)
          return contextBundle(project, id, depth ?? 2, steps(project))!
        }),
      sdp_snippets: ({ id }) =>
        Effect.gen(function*() {
          const project = yield* load
          if (!project.graph.node(id)) return yield* toolError(`no node ${id}`)
          const spec = project.specById.get(id)
          if (!spec || spec.scenarios.length === 0) return `${id} has no scenarios`
          const { files, matcher } = steps(project)
          const unmatched = unmatchedSteps(project, matcher, (_, s) => s.id === id)
          const where = files.length > 0 ? `step files: ${files.join(", ")}` : "no step files yet"
          if (unmatched.length === 0) return `every step of ${id} has exactly one definition (${where})`
          const lines = unmatched.map((step) =>
            `- ${step.status}: ${step.keyword} ${step.text} — ${step.file}:${step.line}${
              step.definitions ? `; matches ${step.definitions.join(", ")}` : ""
            }`
          )
          const snippets = unmatched.flatMap((step) => step.snippet ? [step.snippet] : [])
          return [
            `${id}: ${unmatched.length} step(s) without exactly one definition (${where})`,
            ...lines,
            ...(snippets.length > 0 ? ["", "```ts", snippetModule(snippets, files).trimEnd(), "```"] : [])
          ].join("\n")
        }),
      sdp_check: ({ severity }) =>
        Effect.map(load, (project) => {
          const found = check(project).filter((d) => atLeast(d.severity, severity ?? "warning"))
          return found.length === 0
            ? "no diagnostics"
            : found.map((d) => `${d.severity} [${d.rule}] ${d.message} ${formatSource(d.source)}${d.hint ? `\n  → ${d.hint}` : ""}`).join("\n")
        }),
      sdp_architecture: () => Effect.map(load, (project) => JSON.stringify(architectureJson(project), null, 2)),
      sdp_lifecycle: () =>
        Effect.gen(function*() {
          const project = yield* load
          return renderLifecycle(lifecycle(project, DateTime.formatIsoDate(yield* DateTime.now)))
        }),
      sdp_status: () => Effect.map(load, (project) => JSON.stringify(statusSummary(project), null, 2))
    })
  }))

/** The tool registrations, for stdio serving and in-memory tests (McpTest.makeClient). */
export const registrations = (root: string) => McpServer.toolkit(SdpToolkit).pipe(Layer.provide(handlers(root)))

export const instructions =
  `sdp exposes a software delivery graph: specs (requirements, quality requirements, ideas) at any maturity, decision records, curated architecture (only significant elements), lifecycle (phases, iterations, milestones), scenarios with execution status, and the code linked to them. TypeScript and JavaScript link code with typed calls, \`annotate(target, { implements: "REQ-x" })\` imported from "sdp/annotations", whose ids the compiler checks once \`sdp types\` has run; other languages use comment lines, \`// @sdp implements REQ-x\`. Start with sdp_status, then sdp_query; use sdp_context before working on a spec and sdp_snippets to automate its scenarios. Relations are free-form; sdp's templates use ${relationVocabulary}. Source files are Markdown with YAML front matter — you can also grep them directly.`

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
