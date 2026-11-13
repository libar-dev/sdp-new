// The adapter, part 2: the runtime each generated test calls — match each step, run it, apply sdp's rules.
import { CucumberExpression, ParameterTypeRegistry } from "/Users/darkomijic/work/sdp-new/node_modules/@cucumber/cucumber-expressions/dist/index.js"
const registry = new ParameterTypeRegistry()
const definitions = []
const define = (expression, handler) => definitions.push({ expression: new CucumberExpression(expression, registry), handler })
export const Given = define, When = define, Then = define

const wanted = process.env.SDP_TAGS // a project's tier, e.g. @native
export async function runScenario(scenario, ctx) {
  await import("./steps/cart.steps.mjs") // a real adapter loads the workspace's step modules once per worker
  if (wanted && !scenario.tags.includes(wanted)) return ctx.skip(`not ${wanted}`)
  const world = {}
  try {
    for (const text of scenario.steps) {
      const found = definitions.flatMap((d) => { const m = d.expression.match(text); return m ? [{ d, args: m.map((a) => a.getValue(world)) }] : [] })
      if (found.length === 0) throw new Error(`undefined step: ${text}`)
      if (found.length > 1) throw new Error(`ambiguous step: ${text}`)
      await found[0].d.handler(world, ...found[0].args)
    }
  } catch (error) {
    // Work still to come runs, and fails no run: it is reported, not failed.
    if (scenario.toCome) return ctx.skip(`still to come: ${error.message}`)
    throw error
  }
}
