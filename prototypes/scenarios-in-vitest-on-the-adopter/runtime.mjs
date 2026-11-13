// What each generated test calls: match each step, run it, apply sdp's rules, and hand sdp's result to the reporter.
import { CucumberExpression, ParameterTypeRegistry } from "/Users/darkomijic/work/sdp-new/node_modules/@cucumber/cucumber-expressions/dist/index.js"
const registry = new ParameterTypeRegistry()
const definitions = []
const define = (expression, handler) => definitions.push({ expression: new CucumberExpression(expression, registry), handler })
export const Given = define, When = define, Then = define
const steps = import.meta.glob("./steps/**/*.steps.ts") // step modules, by what they speak of
let loaded
export async function runScenario(scenario, ctx) {
  const tier = process.env.SDP_TAGS
  if (tier && !scenario.tags.includes(tier)) return ctx.skip(`not ${tier}`)
  await (loaded ??= Promise.all(Object.values(steps).map((load) => load())))
  const world = {}, ran = []
  const record = (status) => { ctx.task.meta.sdp = { id: scenario.id, tier, status, toCome: scenario.toCome, steps: ran } }
  try {
    for (const text of scenario.steps) {
      const found = definitions.flatMap((d) => { const m = d.expression.match(text); return m ? [{ d, args: m.map((a) => a.getValue(world)) }] : [] })
      if (found.length !== 1) { ran.push({ text, status: found.length ? "ambiguous" : "undefined" }); throw new Error(`${found.length ? "ambiguous" : "undefined"} step: ${text}`) }
      try { await found[0].d.handler(world, ...found[0].args); ran.push({ text, status: "passed" }) }
      catch (error) { ran.push({ text, status: "failed" }); throw error }
    }
    record("passed")
  } catch (error) {
    record(ran.at(-1).status)
    if (scenario.toCome) return ctx.skip(`still to come: ${error.message}`) // runs, and fails no run
    throw error
  }
}
