/**
 * Step definitions for executing scenarios: step definitions scripted by a
 * scenario (what they match, how they behave, which module and world they
 * belong to), runs of scenarios and of whole workspaces in memory, run results, and
 * what agents get from them (MCP tools, context bundles, the rule catalogue).
 * Shares its world with every other module (world.ts).
 */
import { Duration, Effect, Layer, Path } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { isDeepStrictEqual } from "node:util"
import { registrations } from "../../src/mcp/Server.ts"
import { rules } from "../../src/model/Diagnostic.ts"
import { builtinSteps } from "../../src/run/Builtin.ts"
import type { StepResult } from "../../src/run/Results.ts"
import { runScenarios } from "../../src/run/Runner.ts"
import { runWorkspace } from "../../src/run/Session.ts"
import { defineSteps, Pending, pending, type StepContext, type StepModule, type StepOutcome } from "../../src/run/Steps.ts"
import { layerMemory, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { ids, newWorld, reload, type World } from "./world.ts"

// --- scripted step definitions ---------------------------------------------

/** A step definition a scenario asks for: what it matches, how it behaves, and where it lives. */
export interface Scripted {
  readonly expression: string
  readonly behaviour: string
  readonly module: string
  readonly world: string
}

interface Received {
  readonly args: ReadonlyArray<unknown>
  readonly doc: string | undefined
  readonly table: ReadonlyArray<ReadonlyArray<string>> | undefined
}

type Behaviour = (
  context: StepContext<Record<string, number>, ReadonlyArray<unknown>>,
  expression: string,
  received: Array<Received>
) => StepOutcome

const failure = (expression: string) => new Error(`deliberate failure in "${expression}"`)

const behaviours: Record<string, Behaviour> = {
  "returns nothing": () => {},
  "throws an error": (_, expression) => {
    throw failure(expression)
  },
  "returns pending()": () => pending("not yet"),
  "throws pending()": () => {
    throw new Pending({ reason: "not yet" })
  },
  "returns a successful Effect": () => Effect.void,
  "returns a failed Effect": (_, expression) => Effect.fail(failure(expression)),
  "returns a resolved Promise": () => Promise.resolve(),
  "returns a rejected Promise": (_, expression) => Promise.reject(failure(expression)),
  "wraps a failing Promise in Effect.tryPromise": (_, expression) => Effect.tryPromise(() => Promise.reject(failure(expression))),
  "takes a second": () => Effect.sleep("1 second"),
  "records its arguments": ({ args, doc, table }, _, received) => void received.push({ args, doc, table }),
  "adds an item to its world": ({ world }) => {
    world.items = (world.items ?? 0) + 1
  },
  "checks the items in its world": ({ args: [expected], world }) => assert.equal(world.items ?? 0, expected, "items in the world")
}
behaviours.passes = behaviours["returns nothing"]!
behaviours.fails = behaviours["throws an error"]!
behaviours.pends = behaviours["returns pending()"]!

/** One step module per module name; modules naming the same world share one world factory. */
const scriptedSteps = (
  definitions: ReadonlyArray<Scripted>,
  received: Array<Received> = []
): ReadonlyArray<StepModule<Record<string, number>>> => {
  const factories = new Map<string, () => Record<string, number>>()
  const factory = (name: string) => {
    if (!factories.has(name)) factories.set(name, () => ({}))
    return factories.get(name)!
  }
  const byModule = Map.groupBy(definitions, (d) => d.module)
  return [...byModule].map(([name, list]) =>
    defineSteps(factory(list[0]!.world), ({ Step }) => {
      for (const { behaviour, expression } of list) Step(expression, (context) => behaviours[behaviour]!(context, expression, received))
    }, { name })
  )
}

interface Execution {
  /** Module and world of `world.definitions[i]`, when a scenario names them. */
  readonly placements: Array<{ readonly module: string; readonly world: string } | undefined>
  readonly received: Array<Received>
  tools: ReadonlyArray<string>
}

const execution = (world: World): Execution =>
  (world.scratch.execution ??= { placements: [], received: [], tools: [] }) as Execution

const scripted = (world: World): ReadonlyArray<Scripted> =>
  world.definitions.map((d, i) => ({ ...d, ...(execution(world).placements[i] ?? { module: "steps", world: "steps" }) }))

const define = (world: World, definition: Scripted) => {
  assert.ok(
    behaviours[definition.behaviour],
    `unknown behaviour "${definition.behaviour}"; use one of: ${Object.keys(behaviours).join(", ")}`
  )
  world.definitions.push({ expression: definition.expression, behaviour: definition.behaviour })
  execution(world).placements[world.definitions.length - 1] = { module: definition.module, world: definition.world }
}

const runInMemory = (world: World, timeout?: Duration.Input) =>
  Effect.gen(function*() {
    const project = yield* reload(world)
    const modules = [builtinSteps, ...scriptedSteps(scripted(world), execution(world).received)]
    world.run = yield* runScenarios({ project, modules, timeout })
    world.files.set(".sdp/results.json", JSON.stringify(world.run))
    yield* reload(world)
  })

/** What `sdp run [targets]` does — selection, ordinary scenarios, then gates — on the in-memory workspace. */
const runWorkspaceInMemory = (world: World, targets: ReadonlyArray<string> = []) =>
  Effect.gen(function*() {
    const modules = [builtinSteps, ...scriptedSteps(scripted(world), execution(world).received)]
    const run = yield* runWorkspace(memoryRoot, { modules, selection: { targets } })
    world.run = run.results
    world.scratch.gateResults = run.gates
    yield* reload(world)
  }).pipe(Effect.provide(Layer.merge(layerMemory(world.files), Path.layer)))

// --- results ----------------------------------------------------------------

const stepsWithText = (world: World, text: string): ReadonlyArray<StepResult> => {
  assert.ok(world.run, "run the scenarios first")
  const found = Object.values(world.run.scenarios).flatMap((s) => s.pickles.flatMap((p) => p.steps)).filter((s) => s.text === text)
  assert.ok(found.length > 0, `no step "${text}" in the results`)
  return found
}

/** Text from a `## <heading…>` line up to the next `## ` heading. */
const section = (output: string, heading: string): string => {
  const start = output.split("\n").findIndex((line) => line.startsWith(`## ${heading}`))
  if (start < 0) return ""
  const rest = output.split("\n").slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith("## "))
  return (end < 0 ? rest : rest.slice(0, end)).join("\n")
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  Given("a step definition {string} that {}", ({ args: [expression, behaviour], world }) =>
    define(world, { expression, behaviour, module: "steps", world: "steps" }))

  Given("the step definitions:", ({ table, world }) => {
    const [header, ...rows] = table ?? []
    const column = (name: string) => {
      const index = header?.indexOf(name) ?? -1
      assert.ok(index >= 0, `the table needs a "${name}" column`)
      return index
    }
    const [module, factory, expression, behaviour] = ["module", "world", "expression", "behaviour"].map(column) as [number, number, number, number]
    for (const row of rows) define(world, { module: row[module]!, world: row[factory]!, expression: row[expression]!, behaviour: row[behaviour]! })
  })

  When("the scenarios are run", ({ world }) => runInMemory(world))

  When("the workspace is run", ({ world }) => runWorkspaceInMemory(world))

  When("the workspace is run for {string}", ({ args: [targets], world }) => runWorkspaceInMemory(world, targets.split(/\s+/)))

  When("the scenarios are run with a step timeout of {int} ms", ({ args: [ms], world }) => runInMemory(world, Duration.millis(ms)))


  Then("scenario {string} has status {string}", ({ args: [id, status], world }) => {
    assert.ok(world.run, "run the scenarios first")
    assert.equal(world.run.scenarios[id]?.status, status, `status of ${id}`)
  })

  Then("scenario {string} has no result", ({ args: [id], world }) => {
    assert.ok(world.run, "run the scenarios first")
    assert.equal(world.run.scenarios[id], undefined, `${id} should not have run`)
  })

  Then("the step {string} has status {string}", ({ args: [text, status], world }) => {
    for (const step of stepsWithText(world, text)) assert.equal(step.status, status, `status of "${text}"${step.error ? `: ${step.error}` : ""}`)
  })

  Then("the step {string} reports {string}", ({ args: [text, message], world }) => {
    for (const step of stepsWithText(world, text)) assert.ok(step.error?.includes(message), `"${text}" reported ${JSON.stringify(step.error)}`)
  })

  Then("the step {string} suggests the definition {string}", ({ args: [text, suggestion], world }) => {
    for (const step of stepsWithText(world, text)) assert.ok(step.snippet?.includes(suggestion), `snippet was ${step.snippet}`)
  })

  Then("the handler received the arguments {}", ({ args: [json], world }) => {
    const expected: unknown = JSON.parse(json)
    const received = execution(world).received.map((r) => r.args)
    assert.ok(received.some((args) => isDeepStrictEqual(args, expected)), `received ${JSON.stringify(received)}`)
  })

  Then("the handler received the doc string {string}", ({ args: [doc], world }) => {
    const received = execution(world).received.map((r) => r.doc)
    assert.ok(received.includes(doc), `received ${JSON.stringify(received)}`)
  })

  Then("the handler received the table:", ({ table, world }) => {
    const received = execution(world).received.map((r) => r.table)
    assert.ok(received.some((t) => isDeepStrictEqual(t, table)), `received ${JSON.stringify(received)}`)
  })

  // --- MCP and context ------------------------------------------------------

  When("an agent lists the MCP tools", ({ world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      execution(world).tools = (yield* client.listTools()).tools.map((t) => t.name)
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(layerMemory(world.files), Path.layer))))

  Then("the MCP tools are {string}", ({ args: [list], world }) => {
    assert.deepEqual([...execution(world).tools].sort(), ids(list))
  })

  // The MCP call step (sdp.steps.ts) records whether the tool answered with an error.
  Then("the MCP tool reports an error", ({ world }) => {
    assert.equal(world.scratch.mcpError, true, `expected a tool error, got:\n${world.output}`)
  })

  Then("the output field {string} holds {string}", ({ args: [field, list], world }) => {
    const value: unknown = JSON.parse(world.output)[field]
    assert.ok(Array.isArray(value), `${field} is not a list in:\n${world.output}`)
    const actual = value.map((v: unknown) => typeof v === "object" && v !== null && "id" in v ? String(v.id) : String(v))
    assert.deepEqual(actual.sort(), ids(list))
  })

  Then("the output section {string} contains {string}", ({ args: [heading, text], world }) => {
    assert.ok(section(world.output, heading).includes(text), `section "${heading}" does not contain ${JSON.stringify(text)}:\n${world.output}`)
  })

  Then("the output section {string} does not contain {string}", ({ args: [heading, text], world }) => {
    assert.ok(!section(world.output, heading).includes(text), `section "${heading}" contains ${JSON.stringify(text)}:\n${world.output}`)
  })

  // --- check ----------------------------------------------------------------

  Then("the {string} diagnostic points at {string}", ({ args: [rule, location], world }) => {
    const found = world.diagnostics?.filter((d) => d.rule === rule) ?? []
    assert.ok(found.length > 0, `no ${rule} diagnostic`)
    const at = found.map((d) => `${d.source?.file}:${d.source?.line}`)
    assert.ok(at.includes(location), `${rule} points at ${at.join(", ")}`)
  })

  // --- this repository ------------------------------------------------------

  Then("every rule sdp reports has an example in this spec", ({ project, scenario }) => {
    const spec = project.specById.get(scenario.specId)
    const steps = (spec?.scenarios ?? []).flatMap((s) => s.pickles.flatMap((p) => p.steps.map((step) => step.text))).join("\n")
    const missing = Object.keys(rules).filter((rule) => !steps.includes(`"${rule}"`))
    assert.equal(missing.length, 0, `rules without an example in ${scenario.specId}: ${missing.join(", ")}`)
  })
})
