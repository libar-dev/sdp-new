/**
 * The lifecycle of the workspace on a given day, as data: its milestones, its iterations and the
 * activity planned into them.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { lifecycle, renderLifecycle } from "../../src/lifecycle/Lifecycle.ts"
import { assertRows, load, newWorld, produce, type Row, type World } from "./world.ts"

const computed = (world: World) => {
  assert.ok(world.lifecycle, "compute the lifecycle first")
  return world.lifecycle
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
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
  // gate (passed/all) and next (yes for the one the project is at).
  Then("the milestones are:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.milestones.map((milestone): Row => ({
      id: milestone.node.id,
      closes: milestone.closes?.id ?? "",
      phase: milestone.phase?.id ?? "",
      iterations: milestone.iterations.map((iteration) => iteration.id).join(", "),
      planned: milestone.planned ?? "",
      met: milestone.met ?? "",
      gate: `${milestone.gate.filter((scenario) => scenario.status === "passed").length}/${milestone.gate.length}`,
      next: milestone === report.next ? "yes" : ""
    }))
    assertRows("milestones", rows, table, "in order")
  })

  // The iterations in the order of the timeline: id, phase, plans (the nodes planned into it),
  // stages (of those nodes, as `draft:1 verified:2`) and today (yes for the one the calendar is in).
  Then("the iterations are:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.work.map((iteration): Row => ({
      id: iteration.node.id,
      phase: report.phases.find((phase) => phase.iterations.some((i) => i.node.id === iteration.node.id))?.node.id ?? "",
      plans: iteration.items.map((item) => item.id).sort().join(", "),
      stages: Object.entries(iteration.stages).sort(([a], [b]) => a.localeCompare(b)).map(([stage, n]) => `${stage}:${n}`).join(" "),
      today: report.current?.id === iteration.node.id ? "yes" : ""
    }))
    assertRows("iterations", rows, table, "in order")
  })

  // The chart as numbers: a row per discipline, a column per iteration.
  Then("the planned activity is:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.disciplines.map((row): Row => ({
      discipline: row.discipline,
      ...Object.fromEntries(report.iterations.map((iteration, column) => [iteration.id, String(row.activity[column])]))
    }))
    assertRows("planned activity", rows, table, "including")
  })
})
