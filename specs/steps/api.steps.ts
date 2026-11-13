/** The package API called by a program, on disk or with an in-memory filesystem. */
import { Effect, Result, Schema } from "effect"
import { strict as assert } from "node:assert"
import * as Api from "sdp"
import * as EffectApi from "sdp/effect"
import { defineSteps } from "sdp/steps"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { newWorld, produce } from "./world.ts"
import { execute, workspace } from "./process.ts"

export default defineSteps(newWorld, ({ Then, When }) => {
  // The programmatic API as a program calls it: `query` from the package's entry point, on these files on disk.
  When("a program asks the API for {string}", async ({ args: [expression], world }) => {
    produce(world, JSON.stringify(await Api.query(await workspace(world), { expression }), null, 2))
  })

  When("a program decodes every record of {string} in the repository with the package's record schema", ({ args: [command], project, world }) =>
    Effect.gen(function*() {
      const result = yield* execute(command, project.root)
      assert.equal(result.code, 0, `${command} exited ${result.code}: ${result.stderr}`)
      const lines = result.stdout.trimEnd().split("\n")
      assert.ok(lines.length > 0 && lines[0] !== "", "the command printed no records")
      const decode = Schema.decodeUnknownResult(Schema.fromJsonString(EffectApi.GraphRecord))
      world.recordDecodeFailures = lines.flatMap((line, index) => {
        const record = decode(line)
        return Result.isFailure(record) ? [`line ${index + 1}: ${record.failure.message}`] : []
      })
    }))

  Then("no record fails to decode", ({ world }) => {
    assert.ok(world.recordDecodeFailures, "no records were decoded")
    assert.deepEqual(world.recordDecodeFailures, [])
  })

  // A program written with Effect: the same use case from "sdp/effect", on a file system it provides.
  When("a program written with Effect asks the API for {string} on files in memory", ({ args: [expression], world }) =>
    Effect.map(EffectApi.query(memoryRoot, { expression }), (answer) => {
      produce(world, JSON.stringify(answer, null, 2))
    }).pipe(Effect.provide(layerMemoryWorkspace(world.files))))
})
