/**
 * This repository's step definitions, held to what a step must do: every definition matches steps
 * of the examples and each step matches one definition, as a run would match them, and a step that
 * is stopped ends the processes it started.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Duration, Effect } from "effect"
import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { defineSteps } from "sdp/steps"
import { runWorkspace } from "../../src/app/Running.ts"
import { builtinSteps } from "../../src/run/Builtin.ts"
import { locate, makeMatcher } from "../../src/run/Match.ts"
import type { StepSignature } from "../../src/parse/StepDefinitions.ts"
import type { Spec } from "../../src/parse/Spec.ts"
import { directoryOf } from "./process.ts"
import { repositoryModules } from "./run.steps.ts"
import { assertRows, load, newWorld, type Row, type World } from "./world.ts"

/** Every example's steps, matched statically with the definitions a run would know, as `sdp steps` reads them. */
interface Matched {
  /** This repository's definitions that no step of any example matches. */
  readonly unused: ReadonlyArray<Row>
  readonly ambiguous: ReadonlyArray<Row>
  /** Examples whose last step is not a Then: by the keyword of its one definition, or as written when it has none. */
  readonly unended: ReadonlyArray<Row>
  /** Steps no definition matches, once per spec. */
  readonly unmatched: ReadonlyArray<Row>
}

const matchExamples = (specs: ReadonlyArray<Spec>, own: ReadonlyArray<StepSignature>, root: string): Matched => {
  const matcher = makeMatcher([...builtinSteps.definitions, ...own])
  const used = new Set<unknown>()
  const ambiguous: Array<Row> = []
  const unended: Array<Row> = []
  const unmatched = new Map<string, Row>()
  for (const spec of specs) {
    for (const scenario of spec.scenarios) {
      for (const pickle of scenario.pickles) {
        let last: { readonly text: string; readonly line: number; readonly then: boolean } | undefined
        for (const step of pickle.steps) {
          const matches = matcher.match(step.text)
          for (const match of matches) used.add(match.definition)
          if (matches.length === 0) unmatched.set(`${spec.id}\n${step.text}`, { spec: spec.id, step: step.text })
          if (matches.length > 1) {
            ambiguous.push({
              step: step.text,
              at: `${spec.file}:${step.line}`,
              definitions: matches.map((match) => locate(root, match.definition.location)).join(", ")
            })
          }
          const keyword = matches.length === 1 ? matches[0]!.definition.keyword : "Step"
          last = { text: step.text, line: step.line, then: keyword === "Step" ? step.type === "Outcome" : keyword === "Then" }
        }
        if (last !== undefined && !last.then) {
          unended.push({ example: scenario.id, name: pickle.name, step: last.text, at: `${spec.file}:${last.line}` })
        }
      }
    }
  }
  return {
    unused: own.filter((definition) => !used.has(definition)).map((definition) => ({
      definition: locate(root, definition.location),
      expression: String(definition.expression)
    })),
    ambiguous,
    unended,
    unmatched: [...unmatched.values()]
  }
}

const matched = (world: World): Matched => {
  const found = world.scratch.matched as Matched | undefined
  assert.ok(found, "match the steps of every example first")
  return found
}

/**
 * A command that runs until it is stopped, and a module whose import keeps its process running:
 * each ignores SIGTERM and starts a process that ignores it too, and the marker names all of them.
 */
const running = (marker: string) => ({
  "<command>": `node -e 'process.on(\`SIGTERM\`,()=>{});if(!process.argv[2])require(\`child_process\`).spawn(process.execPath,[...process.execArgv,process.argv[1],\`child\`],{stdio:\`ignore\`});setInterval(()=>{},1000)' ${marker}`,
  "<module>": `data:text/javascript,process.on('SIGTERM',()=>{});import('node:child_process').then((c)=>c.spawn(process.execPath,['-e','process.on(\`SIGTERM\`,()=>{});setInterval(()=>{},1000)','${marker}'],{stdio:'ignore'}));setInterval(()=>{},1000)`
})

const fill = (text: string, marker: string) =>
  Object.entries(running(marker)).reduce((filled, [placeholder, value]) => filled.replaceAll(placeholder, value), text)

/** The processes of this machine whose command line names the marker, by pid. */
const processesOf = (marker: string): ReadonlyArray<number> =>
  spawnSync("ps", ["-A", "-ww", "-o", "pid=", "-o", "args="], { encoding: "utf8" }).stdout.split("\n")
    .filter((line) => line.includes(marker))
    .map((line) => Number(line.trim().split(/\s+/)[0]))

/** What became of a step stopped while its process ran. */
interface Stopped {
  readonly step: string
  readonly status: string
  readonly error: string
  readonly running: number
}

export default defineSteps(newWorld, ({ Then, When }) => {
  When("the steps of every example of this repository are matched with its step definitions", ({ project, world }) => {
    world.scratch.matched = matchExamples(project.specs, project.steps.definitions, project.root)
  })

  // The examples of the workspace in memory, with this repository's definitions: what the guards would find in them.
  When("the steps of every example of the workspace are matched with this repository's step definitions", ({ project, world }) =>
    Effect.map(load(world), (workspace) => {
      world.scratch.matched = matchExamples(workspace.specs, project.steps.definitions, project.root)
    }))

  Then("the step definitions of this repository that no example uses are:", ({ table, world }) =>
    assertRows("step definitions no example uses", matched(world).unused, table, "exactly"))

  Then("the steps that match more than one definition are:", ({ table, world }) =>
    assertRows("steps that match more than one definition", matched(world).ambiguous, table, "exactly"))

  Then("the examples that do not end on a Then are:", ({ table, world }) =>
    assertRows("examples that do not end on a Then", matched(world).unended, table, "exactly"))

  // One row per spec and step text, however often its examples take the step.
  Then("the steps that no definition matches are:", ({ table, world }) =>
    assertRows("steps that no definition matches", matched(world).unmatched, table, "exactly"))

  // One scenario per row, run with this repository's step definitions and a timeout of 500 ms. In a
  // step, `<command>` is a command that runs until it is stopped and `<module>` a module whose import
  // keeps its process running; each ignores SIGTERM, starts a process that ignores it too, and names
  // a word of its own so that its processes can be found.
  When("each of these steps of this repository times out while the process it started runs:", ({ project, table, world }) =>
    Effect.gen(function*() {
      const [header = [], ...rows] = table ?? []
      const cell = (row: ReadonlyArray<string>, name: string) => header.indexOf(name) < 0 ? "" : (row[header.indexOf(name)] ?? "").replaceAll("\\|", "|")
      const cases = rows.map((row) => ({ step: cell(row, "step"), doc: cell(row, "doc"), marker: `sdp-stopped-${randomUUID()}` }))
      const scenarios = cases.map(({ doc, marker, step }, index) =>
        [
          `    Scenario: Step ${index + 1}`,
          `      When ${fill(step, marker)}`,
          ...(doc === "" ? [] : [`        """`, `        ${fill(doc, marker)}`, `        """`])
        ].join("\n")
      )
      const feature = ["@id=stopped", "Feature: Stopped", "", "  Steps that start a process.", "", "  Rule: A step times out", "", ...scenarios, ""].join("\n")
      const directory = yield* Effect.promise(async () => {
        const directory = await directoryOf(world)
        const file = join(directory, "specs/stopped.feature")
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, feature)
        return directory
      })
      const modules = [builtinSteps, ...yield* Effect.promise(() => repositoryModules(project))]
      const run = yield* runWorkspace(directory, { modules, timeout: Duration.millis(500), concurrency: cases.length }).pipe(
        Effect.provide(NodeServices.layer)
      )
      // A process told to stop may take a moment to end.
      const deadline = Date.now() + 3000
      while (Date.now() < deadline && cases.some(({ marker }) => processesOf(marker).length > 0)) yield* Effect.sleep("100 millis")
      const stopped = cases.map(({ marker, step }, index): Stopped => {
        const result = run.scenarios.find((scenario) => scenario.name === `Step ${index + 1}`)
        const ran = result?.examples[0]?.steps[0]
        const left = processesOf(marker)
        // What is still running is ended here, so that no run of this scenario leaves any behind.
        for (const pid of left) {
          try {
            process.kill(pid, "SIGKILL")
          } catch {
            // Ended meanwhile.
          }
        }
        return { step, status: ran?.status ?? "not run", error: ran?.error ?? "", running: left.length }
      })
      world.scratch.stopped = stopped
    }))

  Then("each timed out and left no process running", ({ world }) => {
    const stopped = world.scratch.stopped as ReadonlyArray<Stopped> | undefined
    assert.ok(stopped, "stop the steps first")
    const wrong = stopped.filter(({ error, running, status }) => status !== "failed" || error !== "step timed out" || running > 0)
    assert.deepEqual(
      wrong.map(({ error, running, status, step }) => `${step} | ${status}${error ? `: ${error}` : ""} | ${running} still running`),
      [],
      "these steps did not time out, or left a process running"
    )
  })
})
