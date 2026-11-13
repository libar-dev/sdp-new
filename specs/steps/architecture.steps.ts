/**
 * The architecture of the scenario's workspace as data: which of its elements reach themselves
 * over a relation, as the guard of this repository's own elements asks.
 */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { queryProject } from "../../src/graph/Query.ts"
import { hasKind } from "../../src/model/Vocabulary.ts"
import { ids, load, newWorld } from "./world.ts"

export default defineSteps(newWorld, ({ Then }) => {
  // The same question repository.steps.ts asks of this repository, asked of the scenario's workspace.
  Then("the elements that reach themselves over {string} links are {string}", ({ args: [rel, expected], world }) =>
    Effect.map(load(world), (project) => {
      const elements = project.graph.nodes().filter((n) => hasKind(project.config.vocabulary, "architectural", n.kind))
      const cyclic = elements.filter((element) => {
        const back = queryProject(project, `#${element.id} -${rel}+-> #${element.id}`)
        assert.ok(Result.isSuccess(back), `the query failed: ${Result.isFailure(back) ? back.failure.message : ""}`)
        return back.success.nodes.length > 0
      })
      assert.deepEqual(cyclic.map((element) => element.id).sort(), ids(expected))
    }))
})
