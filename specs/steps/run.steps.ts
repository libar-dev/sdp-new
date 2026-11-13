/**
 * Running scenarios in memory: step definitions a scenario scripts (what they match, how they
 * behave, which module and world they belong to), the run, and what it recorded for each step.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps, pending, type StepContext, type StepModule, type StepOutcome } from "sdp/steps"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { runWorkspace } from "../../src/app/Running.ts"
import { isDeepStrictEqual } from "node:util"
import type { StepResult } from "../../src/model/Results.ts"
import { builtinSteps } from "../../src/run/Builtin.ts"
import { readResults } from "../../src/run/Store.ts"
import { newWorld, reload, type World } from "./world.ts"

/** A step definition a scenario asks for: what it matches, how it behaves, and where it lives. */
export interface Scripted {
  readonly expression: string
  readonly behaviour: string
  readonly module: string
  readonly world: string
}

interface Received {
  readonly args: ReadonlyArray<unknown>
  readonly table: ReadonlyArray<ReadonlyArray<string>> | undefined
}

/** What scripted step definitions record for the outer scenario to assert on. */
interface Log {
  readonly received: Array<Received>
  readonly timeline: Array<{ readonly scenario: string; readonly start: number; readonly end: number }>
  /** Expressions whose handler saw its signal abort. */
  readonly aborted: Array<string>
}

type Behaviour = (
  context: StepContext<Record<string, number>, ReadonlyArray<unknown>>,
  expression: string,
  log: Log
) => StepOutcome

const failure = (expression: string) => new Error(`deliberate failure in "${expression}"`)

const behaviours: Record<string, Behaviour> = {
  passes: () => {},
  fails: (_, expression) => {
    throw failure(expression)
  },
  pends: () => pending("not yet"),
  // Never settles on its own: only an aborted signal ends it.
  "waits for its signal": ({ signal }, expression, log) =>
    new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => {
        log.aborted.push(expression)
        resolve()
      }, { once: true })
    }),
  "records its arguments": ({ args, table }, _, log) => void log.received.push({ args, table }),
  "takes a moment": ({ scenario }, _, log) =>
    Effect.gen(function*() {
      const start = performance.now()
      yield* Effect.sleep("50 millis")
      log.timeline.push({ scenario: scenario.name, start, end: performance.now() })
    }),
  "adds an item to its world": ({ world }) => {
    world.items = (world.items ?? 0) + 1
  },
  "checks the items in its world": ({ args: [expected], world }) => assert.equal(world.items ?? 0, expected, "items in the world")
}

/** One step module per module name; modules naming the same world share one world factory. */
const scriptedSteps = (
  definitions: ReadonlyArray<Scripted>,
  log: Log
): ReadonlyArray<StepModule<Record<string, number>>> => {
  const factories = new Map<string, () => Record<string, number>>()
  const factory = (name: string) => {
    if (!factories.has(name)) {
      factories.set(name, () => ({}))
    }
    return factories.get(name)!
  }
  const byModule = Map.groupBy(definitions, (d) => d.module)
  return [...byModule.values()].map((list) =>
    defineSteps(factory(list[0]!.world), ({ Step }) => {
      for (const { behaviour, expression } of list) {
        const handler = (context: StepContext<Record<string, number>, ReadonlyArray<unknown>>) => behaviours[behaviour]!(context, expression, log)
        // A scenario writes a regular expression the way code does: between slashes.
        const regexp = /^\/(.*)\/$/.exec(expression)
        if (regexp) Step(new RegExp(regexp[1]!), handler)
        else Step(expression, handler)
      }
    })
  )
}

interface Execution extends Log {
  /** Module and world of `world.definitions[i]`, when a scenario names them. */
  readonly placements: Array<{ readonly module: string; readonly world: string } | undefined>
}

const execution = (world: World): Execution =>
  (world.scratch.execution ??= { placements: [], received: [], timeline: [], aborted: [] }) as Execution

const scripted = (world: World): ReadonlyArray<Scripted> =>
  world.definitions.map((d, i) => ({ ...d, ...(execution(world).placements[i] ?? { module: "steps", world: "steps" }) }))

/** Adds a scripted definition; one with an expression already there takes its place, as an edit of the step file would. */
const define = (world: World, definition: Scripted) => {
  assert.ok(
    behaviours[definition.behaviour],
    `unknown behaviour "${definition.behaviour}"; use one of: ${Object.keys(behaviours).join(", ")}`
  )
  const existing = world.definitions.findIndex((d) => d.expression === definition.expression)
  const index = existing < 0 ? world.definitions.length : existing
  world.definitions[index] = { expression: definition.expression, behaviour: definition.behaviour }
  execution(world).placements[index] = { module: definition.module, world: definition.world }
}

interface RunInMemory {
  readonly targets?: ReadonlyArray<string>
  readonly tags?: string
  readonly concurrency?: number
}

/** What `sdp run [targets] [--tags]` does — selection, ordinary scenarios, then gates — on the in-memory workspace. */
const runInMemory = (world: World, options: RunInMemory = {}) =>
  Effect.gen(function*() {
    const modules = [builtinSteps, ...scriptedSteps(scripted(world), execution(world))]
    const { concurrency, ...selection } = options
    const run = yield* runWorkspace(memoryRoot, { modules, selection, concurrency })
    world.run = run.results
    yield* reload(world)
  }).pipe(Effect.provide(layerMemoryWorkspace(world.files)))

const interval = (world: World, scenario: string) => {
  const found = execution(world).timeline.find((t) => t.scenario === scenario)
  assert.ok(found, `"${scenario}" recorded no timing; recorded: ${execution(world).timeline.map((t) => t.scenario).join(", ")}`)
  return found
}

const stepsWithText = (world: World, text: string): ReadonlyArray<StepResult> => {
  assert.ok(world.run, "run the scenarios first")
  const found = Object.values(world.run.scenarios).flatMap((s) => s.examples.flatMap((p) => p.steps)).filter((s) => s.text === text)
  assert.ok(found.length > 0, `no step "${text}" in the results`)
  return found
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  Given("a step definition {string} that {}", ({ args: [expression, behaviour], world }) =>
    define(world, { expression, behaviour, module: "steps", world: "steps" }))

  // One row per definition: the module it is in, the world that module asks for, its expression
  // and how it behaves.
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

  When("the workspace is run", ({ world }) => runInMemory(world))

  // With what `sdp run` takes: targets, `--tags '<expression>'` and `--concurrency <n>`.
  When("the workspace is run with {string}", ({ args: [line], world }) => {
    const words = [...line.matchAll(/'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2]!)
    const value = (flag: string) => words.includes(flag) ? words.splice(words.indexOf(flag), 2)[1] : undefined
    const tags = value("--tags")
    const concurrency = value("--concurrency")
    return runInMemory(world, { targets: words, ...(tags ? { tags } : {}), ...(concurrency ? { concurrency: Number(concurrency) } : {}) })
  })

  // Two runs over the same workspace in one process, as two agents or shells would start them.
  When("the workspace is run for {string} and for {string} at the same time", ({ args: [first, second], world }) =>
    Effect.gen(function*() {
      yield* Effect.all([runInMemory(world, { targets: [first] }), runInMemory(world, { targets: [second] })], { concurrency: 2 })
      const project = yield* reload(world)
      world.run = yield* readResults(memoryRoot, project.config)
    }).pipe(Effect.provide(layerMemoryWorkspace(world.files))))

  Then("the step {string} has status {string}", ({ args: [text, status], world }) => {
    for (const step of stepsWithText(world, text)) assert.equal(step.status, status, `status of "${text}"${step.error ? `: ${step.error}` : ""}`)
  })

  Then("the step {string} reports {string}", ({ args: [text, message], world }) => {
    for (const step of stepsWithText(world, text)) assert.ok(step.error?.includes(message), `"${text}" reported ${JSON.stringify(step.error)}`)
  })

  Then("the handler received the arguments {}", ({ args: [json], world }) => {
    const expected: unknown = JSON.parse(json)
    const received = execution(world).received.map((r) => r.args)
    assert.ok(received.some((args) => isDeepStrictEqual(args, expected)), `received ${JSON.stringify(received)}`)
  })

  Then("the handler received the table:", ({ table, world }) => {
    const received = execution(world).received.map((r) => r.table)
    assert.ok(received.some((t) => isDeepStrictEqual(t, table)), `received ${JSON.stringify(received)}`)
  })

  Then("the handler of {string} saw its signal abort", ({ args: [expression], world }) => {
    assert.ok(execution(world).aborted.includes(expression), `the signal of "${expression}" did not abort`)
  })

  Then("the scenarios {string} and {string} overlapped", ({ args: [a, b], world }) => {
    const [first, second] = [interval(world, a), interval(world, b)]
    assert.ok(first.start < second.end && second.start < first.end, `"${a}" and "${b}" ran one after the other`)
  })

  Then("the scenario {string} ran alone", ({ args: [name], world }) => {
    const alone = interval(world, name)
    const overlapping = execution(world).timeline.filter((t) => t !== alone && t.start < alone.end && alone.start < t.end)
    assert.equal(overlapping.length, 0, `"${name}" overlapped ${overlapping.map((t) => `"${t.scenario}"`).join(", ")}`)
  })
})
