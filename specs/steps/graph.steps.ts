/** The graph built from the scenario's files: its nodes with their attributes, its edges, and its records exported. */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { jsonLines, stateRecords } from "../../src/graph/Export.ts"
import { formatSource } from "../../src/model/Graph.ts"
import { assertRows, ids, load, newWorld, node, produce, show, type Table, type World } from "./world.ts"

/** Every node of the workspace graph as a row of the columns the table names. */
const assertNodes = Effect.fnUntraced(function*(world: World, table: Table | undefined, mode: "exactly" | "including" = "exactly") {
  const project = yield* load(world)
  const columns = (table?.[0] ?? []).map((cell) => cell.trim())
  const rows = project.graph.nodes().map((n) => ({
    ...Object.fromEntries(columns.map((column) => [column, show(n.attrs[column])])),
    id: n.id,
    kind: n.kind,
    title: n.title,
    source: formatSource(n.source)
  }))
  assertRows("nodes", rows, table, mode)
})

export default defineSteps(newWorld, ({ Then, When }) => {
  // Any attribute, or one of what every node has: kind, title, source (`file:line`).
  Then("the workspace node {string} has attribute {word} = {string}", ({ args: [id, key, value], world }) =>
    Effect.map(load(world), (project) => {
      const n = node(project, id)
      const actual = key === "title" ? n.title : key === "kind" ? n.kind : key === "source" ? formatSource(n.source) : n.attrs[key]
      assert.equal(String(actual), value, `${id}.${key}`)
    }))

  // Every attribute, with its value as a reader sees it and as JSON, which shows its type: 1 is a
  // number, "1" a string.
  Then("the workspace node {string} has these attributes:", ({ args: [id], table, world }) =>
    Effect.map(load(world), (project) =>
      assertRows(
        `attributes of ${id}`,
        Object.entries(node(project, id).attrs).map(([key, value]) => ({ key, value: show(value), json: JSON.stringify(value) })),
        table
      )))

  // Every node, a row each, with what every node has and any attribute as a column of its own; an
  // attribute a node does not have reads as an empty cell.
  Then("the workspace graph has nodes:", ({ table, world }) => assertNodes(world, table))

  // The nodes the table names, among others.
  Then("the workspace graph has at least these nodes:", ({ table, world }) => assertNodes(world, table, "including"))

  Then("the workspace graph has edges:", ({ table, world }) =>
    Effect.map(load(world), (project) =>
      assertRows(
        "edges",
        project.graph.edges().map((e) => ({
          from: e.from,
          rel: e.rel,
          to: e.to,
          source: formatSource(e.source),
          sources: (e.sources ?? []).map(formatSource).join(", ")
        })),
        table,
        "exactly"
      )))

  Then("the edges from {string} are {string}", ({ args: [from, expected], world }) =>
    Effect.map(load(world), (project) =>
      assert.deepEqual(project.graph.out(from).map((e) => `${e.from} -${e.rel}-> ${e.to}`).sort(), ids(expected))))

  When("the graph is exported", ({ world }) =>
    Effect.map(load(world), (project) => {
      produce(world, jsonLines(stateRecords(project.graph, project.config.vocabulary)))
    }))
})
