/**
 * The lifecycle of the workspace on a given day, as data: its milestones, its iterations and the
 * activity planned into them.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { lifecycle, renderLifecycle } from "../../src/lifecycle/Lifecycle.ts"
import { assertRows, ids, load, newWorld, produce, type Row, type World } from "./world.ts"

const computed = (world: World) => {
  assert.ok(world.lifecycle, "compute the lifecycle first")
  return world.lifecycle
}

export default defineSteps(newWorld, ({ Then, When }) => {
  When("the lifecycle is computed", ({ world }) =>
    Effect.map(load(world), (project) => {
      world.lifecycle = lifecycle(project)
      produce(world, renderLifecycle(world.lifecycle))
    }))

  When("the lifecycle is computed on {string}", ({ args: [today], world }) =>
    Effect.map(load(world), (project) => {
      world.lifecycle = lifecycle(project, today)
      produce(world, renderLifecycle(world.lifecycle))
    }))

  // The milestones in the order of the timeline: id, closes, phase, iterations, planned, met,
  // gate (passed/all, empty once met) and next (yes for the one the project is at).
  Then("the milestones are:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.milestones.map((milestone): Row => ({
      id: milestone.node.id,
      closes: milestone.closes?.id ?? "",
      phase: milestone.phase?.id ?? "",
      iterations: milestone.iterations.map((iteration) => iteration.id).join(", "),
      planned: milestone.planned ?? "",
      met: milestone.met ?? "",
      gate: milestone.gate ? `${milestone.gate.filter((scenario) => scenario.status === "passed").length}/${milestone.gate.length}` : "",
      next: milestone === report.next ? "yes" : ""
    }))
    assertRows("milestones", rows, table, "in order")
  })

  // The ids of the work still to come that nothing plans, in any order, or "nothing".
  Then("the unplanned work is {string}", ({ args: [expected], world }) => {
    assert.deepEqual(computed(world).unplanned.map((node) => node.id).sort(), ids(expected))
  })

  // The chart as numbers: a row per discipline, a column per iteration.
  Then("the planned activity is:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.disciplines.map((row): Row => ({
      discipline: row.discipline,
      ...Object.fromEntries(report.iterations.map((iteration, column) => [iteration.id, String(row.activity[column])]))
    }))
    assertRows("planned activity", rows, table, "exactly")
  })
})
