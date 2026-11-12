/**
 * Step definitions for executing scenarios: step definitions scripted by a
 * scenario (what they match, how they behave, which module and world they
 * belong to), runs of scenarios and of whole workspaces in memory, run results, and
 * what agents get from them (MCP tools, context bundles, the rule catalogue).
 * Shares its world with every other module (world.ts).
 */
import { defineSteps, Pending, pending, type StepContext, type StepModule, type StepOutcome } from "sdp/steps"
import { Duration, Effect } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { isDeepStrictEqual, promisify } from "node:util"
import { registrations } from "../../src/mcp/Server.ts"
import { rules } from "../../src/model/Diagnostic.ts"
import type { ScenarioResult, StepResult } from "../../src/model/Results.ts"
import { builtinSteps } from "../../src/run/Builtin.ts"
import { runWorkspace } from "../../src/app/Running.ts"
import { readResults } from "../../src/run/Store.ts"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { ids, newWorld, output, produce, reload, type World } from "./world.ts"

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

/** What scripted step definitions record for the outer scenario to assert on. */
interface Log {
  readonly received: Array<Received>
  readonly timeline: Array<{ readonly scenario: string; readonly start: number; readonly end: number }>
  /** Expressions whose handler waits for its signal, and those whose handler saw it abort. */
  readonly waiting: Array<string>
  readonly aborted: Array<string>
}

type Behaviour = (
  context: StepContext<Record<string, number>, ReadonlyArray<unknown>>,
  expression: string,
  log: Log
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
  // Never yields, so nothing can interrupt it: the timeout can only be noticed afterwards.
  "keeps the thread busy for 200 ms": () => {
    const until = performance.now() + 200
    while (performance.now() < until) { /* busy */ }
  },
  // Never settles on its own: only an aborted signal ends it.
  "waits for its signal": ({ signal }, expression, log) =>
    new Promise<void>((resolve) => {
      log.waiting.push(expression)
      signal.addEventListener("abort", () => {
        log.aborted.push(expression)
        resolve()
      }, { once: true })
    }),
  "records its arguments": ({ args, doc, table }, _, log) => void log.received.push({ args, doc, table }),
  "takes a moment": ({ scenario }, _, log) =>
    Effect.gen(function*() {
      const start = performance.now()
      yield* Effect.sleep("50 millis")
      log.timeline.push({ scenario: scenario.name, start, end: performance.now() })
    }),
  "finds every scenario unrun": ({ project }) => {
    const statuses = project.graph.ofKind(["scenario"]).map((node) => node.attrs.status)
    assert.deepEqual([...new Set(statuses)], ["unrun"], "scenario statuses in the graph")
    assert.equal(project.results, undefined, "stored results")
  },
  // What a gate sees: the ordinary scenarios by status, none of the records behind them.
  "finds statuses without run details": ({ project }) => {
    const scenarios = project.graph.ofKind(["scenario"])
    assert.equal(project.results, undefined, "stored results")
    assert.deepEqual(scenarios.filter((node) => node.attrs.lastRun !== undefined).map((node) => node.id), [], "scenarios that show when they ran")
    assert.ok(scenarios.some((node) => node.attrs.status === "passed"), "no ordinary scenario shows as passed")
  },
  "adds an item to its world": ({ world }) => {
    world.items = (world.items ?? 0) + 1
  },
  "checks the items in its world": ({ args: [expected], world }) => assert.equal(world.items ?? 0, expected, "items in the world")
}
behaviours.passes = behaviours["returns nothing"]!
behaviours.fails = behaviours["throws an error"]!
behaviours.pends = behaviours["returns pending()"]!

/** The world a scripted module names to get a factory that throws. */
const throwingWorld = "throwing"

/** One step module per module name; modules naming the same world share one world factory. */
const scriptedSteps = (
  definitions: ReadonlyArray<Scripted>,
  log: Log = { received: [], timeline: [], waiting: [], aborted: [] }
): ReadonlyArray<StepModule<Record<string, number>>> => {
  const factories = new Map<string, () => Record<string, number>>()
  const factory = (name: string) => {
    if (!factories.has(name)) {
      factories.set(name, name === throwingWorld ? () => { throw new Error("deliberate failure in the world factory") } : () => ({}))
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
  /** The scenarios a run reported while it ran, in the order it reported them. */
  readonly progress: Array<string>
  tools: ReadonlyArray<{ readonly name: string; readonly annotations?: Readonly<Record<string, unknown>> | undefined }>
}

const execution = (world: World): Execution =>
  (world.scratch.execution ??= { placements: [], progress: [], received: [], timeline: [], waiting: [], aborted: [], tools: [] }) as Execution

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
  readonly timeout?: Duration.Input
  readonly onScenario?: (result: ScenarioResult) => Effect.Effect<void>
}

/** What `sdp run [targets] [--tags]` does — selection, ordinary scenarios, then gates — on the in-memory workspace. */
const runInMemory = (world: World, options: RunInMemory = {}) =>
  Effect.gen(function*() {
    const modules = [builtinSteps, ...scriptedSteps(scripted(world), execution(world))]
    const { concurrency, onScenario, timeout, ...selection } = options
    const run = yield* runWorkspace(memoryRoot, { modules, selection, concurrency, timeout, onScenario })
    world.run = run.results
    yield* reload(world)
  }).pipe(Effect.provide(layerMemoryWorkspace(world.files)))

const interval = (world: World, scenario: string) => {
  const found = execution(world).timeline.find((t) => t.scenario === scenario)
  assert.ok(found, `"${scenario}" recorded no timing; recorded: ${execution(world).timeline.map((t) => t.scenario).join(", ")}`)
  return found
}

// --- results ----------------------------------------------------------------

const stepsWithText = (world: World, text: string): ReadonlyArray<StepResult> => {
  assert.ok(world.run, "run the scenarios first")
  const found = Object.values(world.run.scenarios).flatMap((s) => s.examples.flatMap((p) => p.steps)).filter((s) => s.text === text)
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

  // One row per definition: the module it is in, the world that module asks for ("throwing" for a
  // factory that throws), its expression and how it behaves.
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

  When(
    "the workspace is run for {string} with concurrency {int} and a reporter that takes a moment",
    ({ args: [target, concurrency], world }) =>
    runInMemory(world, {
      targets: [target],
      concurrency,
      onScenario: (result) =>
        Effect.gen(function*() {
          execution(world).progress.push(`start ${result.name}`)
          yield* Effect.sleep("10 millis")
          execution(world).progress.push(`end ${result.name}`)
        })
    }))

  Then("the reporter saw {string}", ({ args: [events], world }) => {
    assert.deepEqual(execution(world).progress, events.split(/,\s*/))
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

  When("the workspace is run with a step timeout of {int} ms", ({ args: [ms], world }) => runInMemory(world, { timeout: Duration.millis(ms) }))

  // The run is interrupted once the handler is waiting, however long it took to get there.
  When("the workspace is run and interrupted while {string} runs", ({ args: [expression], world }) =>
    Effect.raceFirst(
      runInMemory(world),
      Effect.gen(function*() {
        while (!execution(world).waiting.includes(expression)) yield* Effect.sleep("5 millis")
      })
    ))

  Then("the handler of {string} saw its signal abort", ({ args: [expression], world }) => {
    assert.ok(execution(world).aborted.includes(expression), `the signal of "${expression}" did not abort`)
  })

  Then("the step {string} has status {string}", ({ args: [text, status], world }) => {
    for (const step of stepsWithText(world, text)) assert.equal(step.status, status, `status of "${text}"${step.error ? `: ${step.error}` : ""}`)
  })

  Then("the step {string} reports {string}", ({ args: [text, message], world }) => {
    for (const step of stepsWithText(world, text)) assert.ok(step.error?.includes(message), `"${text}" reported ${JSON.stringify(step.error)}`)
  })

  Then("the step {string} did not run", ({ args: [text], world }) => {
    assert.ok(world.run, "run the scenarios first")
    const ran = Object.values(world.run.scenarios).flatMap((s) => s.examples.flatMap((p) => p.steps)).filter((s) => s.text === text)
    assert.equal(ran.length, 0, `"${text}" ran: ${ran.map((s) => s.status).join(", ")}`)
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

  // --- the step API ---------------------------------------------------------

  // Every module the import loads, one URL per line, as a load hook sees them.
  When("a fresh Node process imports {string}", async ({ args: [specifier], project, world }) => {
    const script = [
      `import { registerHooks } from "node:module"`,
      `registerHooks({ load: (url, context, nextLoad) => (console.log(url), nextLoad(url, context)) })`,
      `await import(${JSON.stringify(specifier)})`
    ].join("\n")
    const { stdout: loaded } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { cwd: project.root })
    produce(world, loaded)
  })

  // --- MCP and context ------------------------------------------------------

  When("an agent lists the MCP tools", ({ world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      execution(world).tools = (yield* client.listTools()).tools
    }).pipe(Effect.scoped, Effect.provide(layerMemoryWorkspace(world.files))))

  Then("the MCP tools are {string}", ({ args: [list], world }) => {
    assert.deepEqual(execution(world).tools.map((t) => t.name).sort(), ids(list))
  })

  Then("every MCP tool is marked {string}", ({ args: [hints], world }) => {
    for (const tool of execution(world).tools) {
      for (const hint of hints.split(/,\s*/)) {
        assert.equal(tool.annotations?.[hint], true, `${tool.name} is not marked ${hint}: ${JSON.stringify(tool.annotations)}`)
      }
    }
  })

  // The MCP call step (sdp.steps.ts) records whether the tool answered with an error.
  Then("the MCP tool reports an error", ({ world }) => {
    assert.equal(world.scratch.mcpError, true, `expected a tool error, got:\n${output(world)}`)
  })

  // The `## ` headings of a Markdown document, in the order they come.
  Then("the sections of the output are {string}", ({ args: [expected], world }) => {
    const headings = output(world).split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3))
    assert.deepEqual(headings, expected.split(",").map((heading) => heading.trim()))
  })

  Then("the output section {string} contains {string}", ({ args: [heading, text], world }) => {
    assert.ok(section(output(world), heading).includes(text), `section "${heading}" does not contain ${JSON.stringify(text)}:\n${output(world)}`)
  })

  Then("the output section {string} does not contain {string}", ({ args: [heading, text], world }) => {
    assert.ok(!section(output(world), heading).includes(text), `section "${heading}" contains ${JSON.stringify(text)}:\n${output(world)}`)
  })

  // --- this repository ------------------------------------------------------

  Then("every rule sdp reports has an example in this spec", ({ project, scenario }) => {
    const spec = project.specById.get(scenario.specId)
    const cells = new Set((spec?.scenarios ?? []).flatMap((s) => s.pickles.flatMap((p) => p.steps.flatMap((step) => step.dataTable?.flat() ?? []))))
    const missing = Object.keys(rules).filter((rule) => !cells.has(rule))
    assert.equal(missing.length, 0, `rules without an example in ${scenario.specId}: ${missing.join(", ")}`)
  })
})
