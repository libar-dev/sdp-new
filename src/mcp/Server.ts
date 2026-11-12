/**
 * MCP server exposing the graph to AI agents. Every call reloads the
 * workspace, so agents always see the files as they are now — including
 * edits they just made.
 */
import { NodeStdio } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Path, Result, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import { architectureView, significance } from "../arch/Significance.ts"
import { check } from "../check/Check.ts"
import { contextBundle } from "../graph/Context.ts"
import { nodeJson, statusCell } from "../graph/Export.ts"
import { formatPath, projectOrderings, query } from "../graph/Query.ts"
import { statusSummary } from "../graph/Status.ts"
import { formatSource } from "../model/Graph.ts"
import { loadProject } from "../workspace/Workspace.ts"

// @sdp is ARCH-mcp

const queryHelp = `SDPQ path patterns, one line:
  kind[cond, ...] -rel-> kind[...] <-rel- * ...
Node: kind | kind|kind | * | #ID | #ID|ID, then [conditions]: key, !key, key=a|b, key!=a, key~regex, key<v, key>=v
  (maturity and stage compare along idea < draft < specified < ready < in-progress < verified).
Edge: -rel-> out, <-rel- in, -rel- either; * or empty = any relation; a|b alternatives; trailing + = transitive.
  Prefix ! keeps nodes WITHOUT such a neighbour, ? keeps nodes WITH one (filters, does not move).
Examples:
  requirement[maturity<ready]
  requirement -realized-by-> element[significant]
  element[significant] !-*- decision
  #DEC-0002 <-*- *
  scenario[status=failed] -verifies-> *`

const text = { success: Schema.String, failure: Schema.String, failureMode: "return" as const }

const SdpQuery = Tool.make("sdp_query", {
  description: `Query the system graph (specs, decisions, architecture, scenarios, code links).\n${queryHelp}`,
  parameters: Schema.Struct({
    expression: Schema.String.annotate({ description: "SDPQ expression" }),
    paths: Schema.optional(Schema.Boolean).annotate({ description: "Return matched paths instead of end nodes" })
  }),
  ...text
})

const SdpShow = Tool.make("sdp_show", {
  description: "One node as JSON: attributes, source file:line, incoming and outgoing edges.",
  parameters: Schema.Struct({ id: Schema.String }),
  ...text
})

const SdpContext = Tool.make("sdp_context", {
  description:
    "Everything needed to work on one node, as Markdown: the spec text, relationships, scenario status with suggested step definitions, significant architecture, patterns and decisions in reach, linked code.",
  parameters: Schema.Struct({
    id: Schema.String,
    depth: Schema.optional(Schema.Number).annotate({ description: "Hops to search for architecture and decisions (default 2)" })
  }),
  ...text
})

const SdpCheck = Tool.make("sdp_check", {
  description: "Validate the workspace: dangling links, maturity gates, decision hygiene, significance curation. Each item has a hint.",
  parameters: Schema.Struct({
    severity: Schema.optional(Schema.Literals(["error", "warning", "info"])).annotate({ description: "Minimum severity (default warning)" })
  }),
  ...text
})

const SdpArchitecture = Tool.make("sdp_architecture", {
  description:
    "The curated architecture only: significant elements (with rationale), the patterns they apply, and the decisions/quality requirements that justify them. Use before designing a change.",
  ...text
})

const SdpStatus = Tool.make("sdp_status", {
  description: "Summary counts: node kinds, relations in use, spec stages, decision statuses, scenario results, significance ratio, diagnostics.",
  ...text
})

export const SdpToolkit = Toolkit.make(SdpQuery, SdpShow, SdpContext, SdpCheck, SdpArchitecture, SdpStatus)

const handlers = (root: string) =>
  SdpToolkit.toLayer(Effect.gen(function*() {
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
    const load = loadProject(root).pipe(Effect.provide(services), Effect.mapError((e) => `could not load workspace: ${String(e)}`))
    return SdpToolkit.of({
      sdp_query: ({ expression, paths }) =>
        Effect.flatMap(load, (project) => {
          const result = query(project.graph, expression, { orderings: projectOrderings(project.config.maturity) })
          if (Result.isFailure(result)) return Effect.fail(`query error: ${result.failure.message}\n\n${queryHelp}`)
          const { nodes } = result.success
          if (paths) return Effect.succeed(result.success.paths.map(formatPath).join("\n") || "no matches")
          return Effect.succeed(
            nodes.length === 0
              ? "no matches"
              : [
                `${nodes.length} node(s)`,
                ...nodes.map((n) =>
                  [n.id, n.kind, statusCell(n), n.title, formatSource(n.source)].join("\t")
                )
              ].join("\n")
          )
        }),
      sdp_show: ({ id }) =>
        Effect.flatMap(load, (project) => {
          const node = project.graph.node(id)
          if (!node) return Effect.fail(`no node ${id}`)
          return Effect.succeed(JSON.stringify({ node: nodeJson(node), out: project.graph.out(id), in: project.graph.in(id) }, null, 2))
        }),
      sdp_context: ({ depth, id }) =>
        Effect.flatMap(load, (project) => {
          const bundle = contextBundle(project, id, depth ?? 2)
          return bundle ? Effect.succeed(bundle) : Effect.fail(`no node ${id}`)
        }),
      sdp_check: ({ severity }) =>
        Effect.map(load, (project) => {
          const rank = { error: 0, warning: 1, info: 2 } as const
          const limit = rank[severity ?? "warning"]
          const found = check(project).filter((d) => rank[d.severity] <= limit)
          return found.length === 0
            ? "no diagnostics"
            : found.map((d) => `${d.severity} [${d.rule}] ${d.message} ${formatSource(d.source)}${d.hint ? `\n  → ${d.hint}` : ""}`).join("\n")
        }),
      sdp_architecture: () =>
        Effect.map(load, (project) => {
          const report = significance(project)
          const view = architectureView(project)
          return JSON.stringify(
            {
              significant: `${report.significant.length} of ${report.population} abstractions (${(report.ratio * 100).toFixed(1)}%; guideline ~${
                (report.guideline * 100).toFixed(0)
              }%)`,
              nodes: view.nodes.map(nodeJson),
              edges: view.edges.map((e) => `${e.from} -${e.rel}-> ${e.to}`)
            },
            null,
            2
          )
        }),
      sdp_status: () => Effect.map(load, (project) => JSON.stringify(statusSummary(project), null, 2))
    })
  }))

/** The tool registrations, for stdio serving and in-memory tests (McpTest.makeClient). */
export const registrations = (root: string) => McpServer.toolkit(SdpToolkit).pipe(Layer.provide(handlers(root)))

export const instructions =
  `sdp exposes a software delivery graph: specs (requirements, quality requirements, ideas) at any maturity, decision records, curated architecture (only significant elements), lifecycle (phases, iterations, milestones), scenarios with execution status, and code linked via @sdp comments. Start with sdp_status, then sdp_query; use sdp_context before working on a spec. Source files are Markdown with YAML front matter — you can also grep them directly.`

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
