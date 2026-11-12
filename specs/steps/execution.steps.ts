/**
 * Step definitions for executing scenarios: step definitions scripted by a
 * scenario (what they match, how they behave, which module and world they
 * belong to), runs in memory and through the command line, run results, and
 * what agents get from them (MCP tools, context bundles, the rule catalogue).
 * Shares its world with every other module (world.ts).
 */
import { Duration, Effect, Layer, Path } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual, promisify } from "node:util"
import { registrations } from "../../src/mcp/Server.ts"
import { builtinSteps } from "../../src/run/Builtin.ts"
import type { RunResults, StepResult } from "../../src/run/Results.ts"
import { runScenarios } from "../../src/run/Runner.ts"
import { defineSteps, Pending, pending, type StepContext, type StepModule, type StepOutcome } from "../../src/run/Steps.ts"
import { layerMemory, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { ids, newWorld, reload, setFile, type World } from "./world.ts"

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

/**
 * One step module per module name; modules naming the same world share one
 * world factory. Exported so a generated steps file can rebuild the same
 * modules when the command line runs a workspace.
 */
export const scriptedSteps = (
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

// --- the command line, on a copy of the workspace ---------------------------

const cli = fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url))

const generatedSteps = (definitions: ReadonlyArray<Scripted>) => {
  const count = new Set(definitions.map((d) => d.module)).size
  const names = Array.from({ length: count }, (_, i) => `steps${i}`)
  return [
    `import { scriptedSteps } from ${JSON.stringify(import.meta.url)}`,
    `export const [${names.join(", ")}] = scriptedSteps(${JSON.stringify(definitions)})`,
    ""
  ].join("\n")
}

/**
 * Copies the workspace to a temporary directory, runs `sdp …` there (single
 * quotes group an argument), and reads back what it wrote to `.sdp/`.
 */
const runCommandLine = (world: World, command: string) =>
  Effect.tryPromise(async () => {
    const [bin, ...argv] = [...command.matchAll(/'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2]!)
    assert.equal(bin, "sdp", `only sdp commands can run on the workspace, got ${command}`)
    const directory = await mkdtemp(join(tmpdir(), "sdp-workspace-"))
    const write = async (file: string, content: string) => {
      await mkdir(dirname(join(directory, file)), { recursive: true })
      await writeFile(join(directory, file), content)
    }
    try {
      for (const [file, content] of world.files) await write(file, content)
      if (world.definitions.length > 0) await write("scripted.steps.ts", generatedSteps(scripted(world)))
      const outcome = await promisify(execFile)(process.execPath, [cli, "-C", directory, ...argv], {
        env: { ...process.env, NO_COLOR: "1" }
      }).then(
        ({ stdout }) => ({ stdout, code: 0 }),
        (error: { stdout?: string; code?: unknown }) => ({ stdout: error.stdout ?? "", code: typeof error.code === "number" ? error.code : 1 })
      )
      world.output = outcome.stdout
      world.exitCode = outcome.code
      const written = await readdir(join(directory, ".sdp"), { recursive: true }).catch(() => [])
      for (const file of written) {
        const content = await readFile(join(directory, ".sdp", file), "utf8").catch(() => undefined)
        if (content !== undefined) setFile(world, `.sdp/${file}`, content)
      }
      const results = world.files.get(".sdp/results.json")
      world.run = results ? (JSON.parse(results) as RunResults) : undefined
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

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

  When("the scenarios are run with a step timeout of {int} ms", ({ args: [ms], world }) => runInMemory(world, Duration.millis(ms)))

  When("{string} is executed in the workspace", ({ args: [command], world }) => runCommandLine(world, command))

  Then("sdp exits with code {int}", ({ args: [code], world }) => {
    assert.equal(world.exitCode, code, `exit code; output:\n${world.output}`)
  })

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

  Then("every rule sdp reports has an example in this spec", ({ project, scenario }) =>
    Effect.tryPromise(async () => {
      const src = join(project.root, "src")
      const rules = new Set<string>()
      for (const file of (await readdir(src, { recursive: true })).filter((f) => f.endsWith(".ts"))) {
        for (const m of (await readFile(join(src, file), "utf8")).matchAll(/rule: "([\w-]+)",\s*severity:/g)) rules.add(m[1]!)
      }
      const spec = project.specById.get(scenario.specId)
      const steps = (spec?.scenarios ?? []).flatMap((s) => s.pickles.flatMap((p) => p.steps.map((step) => step.text))).join("\n")
      const missing = [...rules].filter((rule) => !steps.includes(`"${rule}"`))
      assert.ok(rules.size > 0, "found no rules in src/")
      assert.equal(missing.length, 0, `rules without an example in ${scenario.specId}: ${missing.join(", ")}`)
    }))
})
