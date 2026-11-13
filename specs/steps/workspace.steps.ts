/**
 * Loading the scenario's workspace: what loading it reports, the graph it builds from memory and
 * from disk alike, and a workspace that cannot be loaded.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, FileSystem, Path, Result } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { layerMemoryWorkspace, loadMemoryProject, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { loadProject } from "../../src/workspace/Workspace.ts"
import { ids, newWorld, reload, reportRow } from "./world.ts"

export default defineSteps(newWorld, ({ Then, When }) => {
  When("the workspace is loaded", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.reported = project.diagnostics.map(reportRow)
    }))

  When("the workspace {string} is loaded from memory and from disk", ({ args: [directory], world }) =>
    Effect.gen(function*() {
      const fromMemory = yield* loadProject(`${memoryRoot}/${directory}`).pipe(Effect.provide(layerMemoryWorkspace(world.files)))
      const fromDisk = yield* Effect.scoped(Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped()
        for (const [file, content] of world.files) {
          yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true })
          yield* fs.writeFileString(path.join(root, file), content)
        }
        return yield* loadProject(path.join(root, directory))
      })).pipe(Effect.provide(NodeServices.layer))
      world.workspaceGraphs = [fromMemory.graph, fromDisk.graph]
    }))

  Then("both graphs have exactly the nodes {string}", ({ args: [expected], world }) => {
    const graphs = world.workspaceGraphs
    assert.ok(graphs, "load the workspace from memory and from disk first")
    const [memory, disk] = graphs.map((graph) => graph.nodes().map((node) => node.id).sort())
    assert.deepEqual(memory, ids(expected), "the nodes read from memory")
    assert.deepEqual(disk, ids(expected), "the nodes read from disk")
  })

  Then("loading the workspace fails with {string}", ({ args: [text], world }) =>
    Effect.gen(function*() {
      const outcome = yield* Effect.result(loadMemoryProject(world.files))
      assert.ok(Result.isFailure(outcome), "the workspace loaded")
      const error = outcome.failure as { readonly file?: string; readonly message?: string }
      const message = `${error.file ?? ""}: ${error.message ?? String(outcome.failure)}`
      assert.ok(message.includes(text), `error was ${JSON.stringify(message)}`)
    }))
})
