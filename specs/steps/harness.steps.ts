/**
 * This repository's step definitions, held to what a step must do: every definition matches steps
 * of the examples and each step matches one definition, as a run would match them, and a step that
 * is stopped ends the processes it started.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Duration, Effect } from "effect"
import { strict as assert } from "node:assert"
import { execFile, spawnSync } from "node:child_process"
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
export interface Matched {
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
  const found = world.matchedSteps
  assert.ok(found, "match the steps of every example first")
  return found
}

/**
 * A command that runs until it is stopped, and a program, or a module whose import, keeps its
 * process running: each ignores SIGTERM and starts a process that ignores it too, and the marker,
 * which `<marker>` stands for, names all of them.
 */
const running = (marker: string) => {
  const program = `process.on('SIGTERM',()=>{});import('node:child_process').then((c)=>c.spawn(process.execPath,['-e','process.on(\`SIGTERM\`,()=>{});setInterval(()=>{},1000)','${marker}'],{stdio:'ignore'}));setInterval(()=>{},1000)`
  return {
    "<command>": `node -e 'process.on(\`SIGTERM\`,()=>{});if(!process.argv[2])require(\`child_process\`).spawn(process.execPath,[...process.execArgv,process.argv[1],\`child\`],{stdio:\`ignore\`});setInterval(()=>{},1000)' ${marker}`,
    "<program>": program,
    "<module>": `data:text/javascript,${program}`,
    "<marker>": marker
  }
}

const fill = (text: string, marker: string) =>
  Object.entries(running(marker)).reduce((filled, [placeholder, value]) => filled.replaceAll(placeholder, value), text)

const psArgs = ["-A", "-ww", "-o", "pid=", "-o", "args="]

/** The lines `ps` lists, one per process of this machine; `ps` failing is no list of none. */
const listed = (ps: { readonly status: number | null; readonly stdout: string; readonly stderr: string }): ReadonlyArray<string> => {
  assert.equal(ps.status, 0, `ps could not list the processes: ${ps.stderr}`)
  return ps.stdout.split("\n")
}

const pidsNaming = (lines: ReadonlyArray<string>, marker: string): ReadonlyArray<number> =>
  lines.filter((line) => line.includes(marker)).map((line) => Number(line.trim().split(/\s+/)[0]))

/** The processes of this machine whose command line names the marker, by pid. */
const processesOf = (marker: string): ReadonlyArray<number> =>
  pidsNaming(listed(spawnSync("ps", psArgs, { encoding: "utf8" })), marker)

/** The same, without blocking what runs meanwhile. */
const processesNow = (): Promise<ReadonlyArray<string>> =>
  new Promise((done) =>
    execFile("ps", psArgs, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
      done(listed({ status: error ? Number(error.code ?? 1) : 0, stdout, stderr }))))

/** What became of a step stopped while its process ran. */
export interface Stopped {
  readonly step: string
  readonly status: string
  readonly error: string
  readonly running: number
  /** The most processes naming its marker seen at once while it ran, and how many it starts: itself, and the one it spawns. */
  readonly started: number
  readonly starts: number
}

export default defineSteps(newWorld, ({ Then, When }) => {
  When("the steps of every example of this repository are matched with its step definitions", ({ project, world }) => {
    world.matchedSteps = matchExamples(project.specs, project.steps.definitions, project.root)
  })

  // The examples of the workspace in memory, with this repository's definitions: what the guards would find in them.
  When("the steps of every example of the workspace are matched with this repository's step definitions", ({ project, world }) =>
    Effect.map(load(world), (workspace) => {
      world.matchedSteps = matchExamples(workspace.specs, project.steps.definitions, project.root)
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
  // step, `<command>` is a command that runs until it is stopped, `<program>` a program and `<module>`
  // a module whose import keeps its process running; each ignores SIGTERM, starts a process that
  // ignores it too, and names a word of its own, `<marker>`, so that its processes can be found.
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
      // Each step's processes are seen while the run goes on: a step that timed out before it started
      // them would otherwise leave none running too.
      const started = new Map(cases.map(({ marker }) => [marker, 0]))
      let running = true
      const watching = (async () => {
        while (running) {
          const lines = await processesNow()
          for (const { marker } of cases) started.set(marker, Math.max(started.get(marker) ?? 0, pidsNaming(lines, marker).length))
          await new Promise((done) => setTimeout(done, 50))
        }
      })()
      const run = yield* runWorkspace(directory, { modules, timeout: Duration.millis(500), concurrency: cases.length }).pipe(
        Effect.provide(NodeServices.layer),
        Effect.ensuring(Effect.sync(() => running = false))
      )
      yield* Effect.promise(() => watching)
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
        // A command, a program and a module each start a process that starts one more; sdp mcp is one.
        const starts = /<command>|<program>|<module>/.test(step + rows[index]!.join(" ")) ? 2 : 1
        return { step, status: ran?.status ?? "not run", error: ran?.error ?? "", running: left.length, started: started.get(marker) ?? 0, starts }
      })
      world.stoppedSteps = stopped
    }))

  Then("each timed out and left no process running", ({ world }) => {
    const stopped = world.stoppedSteps
    assert.ok(stopped, "stop the steps first")
    const wrong = stopped.filter(({ error, running, started, starts, status }) =>
      status !== "failed" || error !== "step timed out" || running > 0 || started < starts
    )
    assert.deepEqual(
      wrong.map(({ error, running, started, starts, status, step }) =>
        `${step} | ${status}${error ? `: ${error}` : ""} | ${started} of ${starts} started | ${running} still running`
      ),
      [],
      "these steps did not start their processes before they timed out, did not time out, or left a process running"
    )
  })
})
