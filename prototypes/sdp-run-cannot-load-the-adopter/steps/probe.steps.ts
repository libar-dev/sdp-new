import { defineSteps } from "sdp/steps"
import { strict as assert } from "node:assert"
export default defineSteps(() => ({ mod: undefined as unknown }), ({ When, Then }) => {
  When("the kernel is imported", async ({ world }) => { world.mod = await import("/Users/darkomijic/work/libar-platform/src/kernel/index.ts") })
  When("the simulator composition is imported", async ({ world }) => {
    const m = await import("/Users/darkomijic/work/libar-platform/tests/simulator/production.ts")
    world.mod = m; m.productionTest()
  })
  Then("it exports something", ({ world }) => { assert.ok(Object.keys(world.mod as object).length > 0) })
})
