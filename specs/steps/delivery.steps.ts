/**
 * Planning delivery: a plan larger than an answer may be, the brief of a plan on a given day, how
 * long an answer is, and whether the columns of a chart line up.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { lifecycle, renderBrief } from "../../src/lifecycle/Lifecycle.ts"
import { load, newWorld, output, produce, setFile } from "./world.ts"

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // Draft features, each its own spec with one question still open: specs/feature-<n>.feature.
  Given("{int} features planned into {string}, each with an open question", ({ args: [count, iteration], world }) => {
    for (let n = 1; n <= count; n++) {
      setFile(
        world,
        `specs/feature-${n}.feature`,
        `@id=feature-${n} @maturity=draft @iteration:${iteration}\nFeature: Feature ${n}\n\n  @open\n  Rule: Does feature ${n} wait on a decision?\n`
      )
    }
  })

  // What sdp lifecycle --brief prints for the workspace on that day (YYYY-MM-DD).
  When("the brief is computed on {string}", ({ args: [today], world }) =>
    Effect.map(load(world), (project) => produce(world, renderBrief(lifecycle(project, today), project))))

  // Everything the last step printed, stdout and stderr, counted in characters.
  Then("the output is at most {int} characters", ({ args: [limit], world }) => {
    const text = output(world)
    assert.ok(text.length <= limit, `the output is ${text.length} characters, more than ${limit}:\n${text}`)
  })

  // Each text where it first appears in the output: in its line, how many characters precede it.
  Then("{string} and {string} start in the same column of the output", ({ args: [first, second], world }) => {
    const lines = output(world).split("\n")
    const column = (text: string) => {
      const line = lines.find((candidate) => candidate.includes(text))
      assert.ok(line !== undefined, `no output line contains ${JSON.stringify(text)}:\n${lines.join("\n")}`)
      return line.indexOf(text)
    }
    assert.equal(column(first), column(second), `${JSON.stringify(first)} and ${JSON.stringify(second)} start in different columns:\n${lines.join("\n")}`)
  })
})
