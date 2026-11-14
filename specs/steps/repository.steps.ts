/**
 * What is specific to this repository: the lines its graph points at, and the time its pipeline takes.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { formatSource, type SourceRef } from "../../src/model/Graph.ts"
import { defineSteps } from "sdp/steps"
import { made } from "../../src/model/Vocabulary.ts"
import type { Project } from "../../src/graph/Build.ts"
import { newWorld } from "./world.ts"

/**
 * Every node and link of the graph, followed back to its file and line: those whose line does not
 * exist, and the links whose line does not name their target. A scenario's link to its spec is
 * made by sdp, at the scenario's line, and an element's import at the line that names the module:
 * no author wrote an id there.
 */
const followed = async (project: Project) => {
  const { config, graph, root } = project
  // A scenario's edges and a rule's edge to its spec are at their keyword line, which names neither end.
  const structural = [config.vocabulary.relations.scenario, made.relations.rule, made.relations.imports]
  const lines = new Map<string, ReadonlyArray<string>>()
  const lineAt = async (source: SourceRef | undefined) => {
    if (!source) return undefined
    if (!lines.has(source.file)) lines.set(source.file, (await readFile(join(root, source.file), "utf8")).split("\n"))
    return lines.get(source.file)![source.line - 1]
  }
  const untraceable: Array<string> = []
  const unnamed: Array<string> = []
  for (const node of graph.nodes()) {
    if (await lineAt(node.source) === undefined) untraceable.push(node.id)
  }
  for (const edge of graph.edges()) {
    const label = `${edge.from} -${edge.rel}-> ${edge.to}`
    for (const source of edge.sources ?? [edge.source]) {
      const line = await lineAt(source)
      if (line === undefined) untraceable.push(label)
      else if (!structural.includes(edge.rel) && !line.includes(edge.to)) unnamed.push(`${label} ${formatSource(source)}`)
    }
  }
  return { untraceable, unnamed }
}

export default defineSteps(newWorld, ({ Then }) => {
  Then("every node and link of this repository is at a file and line that exist", ({ project }) =>
    Effect.promise(async () => {
      const { untraceable } = await followed(project)
      assert.equal(untraceable.length, 0, `no file and line for: ${untraceable.slice(0, 10).join(", ")}`)
    }))

  Then("the line of every link of this repository contains the id it links to", ({ project }) =>
    Effect.promise(async () => {
      const { unnamed } = await followed(project)
      assert.equal(unnamed.length, 0, `grep for the target would miss:\n${unnamed.slice(0, 10).join("\n")}`)
    }))

  Then("the median run completes within {int} ms", ({ args: [budget], world }) => {
    assert.ok(world.durationMs <= budget, `median ${world.durationMs.toFixed(1)} ms exceeds ${budget} ms`)
  })
})
