/** What sdp shows of the scenario's workspace: its architecture, and the context of a node. */
import { Effect } from "effect"
import { defineSteps } from "sdp/steps"
import * as Reading from "../../src/app/Reading.ts"
import * as Text from "../../src/app/Text.ts"
import { contextBundle } from "../../src/graph/Context.ts"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { load, newWorld, node, produce } from "./world.ts"

export default defineSteps(newWorld, ({ When }) => {
  When("I ask for the architecture view", ({ world }) =>
    Effect.map(Reading.architecture(memoryRoot), (answer) => {
      produce(world, Text.architecture(answer.data))
    }).pipe(Effect.provide(layerMemoryWorkspace(world.files))))

  // The bundle as it is before any step file is read: what a run recorded is all it knows of the steps.
  When("I ask for the context of {string}", ({ args: [id], world }) =>
    Effect.map(load(world), (project) => {
      produce(world, contextBundle(project, node(project, id)))
    }))
})
