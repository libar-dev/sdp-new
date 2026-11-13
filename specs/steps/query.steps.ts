/**
 * Questions of the scenario's workspace, with the nodes and the routes a query answers, and
 * questions at the bounds sdp keeps: graphs and workspaces large enough to time, routes enough to
 * reach a limit, and paths that are no file. A timed question runs in a worker that is stopped at a
 * deadline, so a question that takes minutes fails in seconds.
 */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { mkdir, symlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Worker } from "node:worker_threads"
import { defineSteps } from "sdp/steps"
import { generateWorkspace } from "../../scripts/bench/generate.ts"
import { formatPath, queryProject } from "../../src/graph/Query.ts"
import { directoryOf, exec, record, workspace } from "./process.ts"
import { assertRows, ids, load, newWorld, setFile, type World } from "./world.ts"

/** How often a question is timed; the median of these runs is its time. */
const timedRuns = 7

const href = (path: string) => JSON.stringify(new URL(path, import.meta.url).href)

/**
 * The worker: draws the graph — kinds, maturities and relations in turn, each edge between two
 * nodes drawn at random (mulberry32, seeded, so every run draws the same graph) — then runs the
 * question `timedRuns` times, posting each time as it is taken.
 */
const timer = `
import { parentPort, workerData } from "node:worker_threads"
import { Result } from ${JSON.stringify(import.meta.resolve("effect"))}
import { projectOrderings, query } from ${href("../../src/graph/Query.ts")}
import { Graph } from ${href("../../src/model/Graph.ts")}
import { defaultVocabulary } from ${href("../../src/model/Vocabulary.ts")}

const { nodeCount, edgeCount, source, runs } = workerData
let seed = 42
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const kinds = ["feature", "element", "decision", "scenario", "code"]
const maturities = ["idea", "draft", "specified", "ready"]
const relations = ["realized-by", "decided-by", "verifies", "depends-on"]
const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: "N" + i, kind: kinds[i % kinds.length], title: "node " + i, attrs: { maturity: maturities[i % maturities.length] } }))
const edges = Array.from({ length: edgeCount }, (_, i) => ({
  from: "N" + Math.floor(random() * nodeCount),
  rel: relations[i % relations.length],
  to: "N" + Math.floor(random() * nodeCount)
}))
const graph = new Graph(nodes, edges)
const options = { orderings: projectOrderings(defaultVocabulary) }
parentPort.postMessage({ ready: true })
for (let i = 0; i < runs; i++) {
  const started = performance.now()
  const result = query(graph, source, options)
  const ms = performance.now() - started
  if (Result.isFailure(result)) {
    parentPort.postMessage({ error: result.failure.message })
    break
  }
  parentPort.postMessage({ ms })
}
`

/** The times of `timedRuns` runs of a question, or a failure once it has run for `seconds` since its graph was drawn. */
const timeInWorker = (
  graph: { readonly nodes: number; readonly edges: number },
  source: string,
  seconds: number,
  signal: AbortSignal
) =>
  new Promise<ReadonlyArray<number>>((resolve, reject) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(timer)}`), {
      workerData: { nodeCount: graph.nodes, edgeCount: graph.edges, source, runs: timedRuns }
    })
    const samples: Array<number> = []
    let deadline: ReturnType<typeof setTimeout> | undefined
    const settle = (outcome: () => void) => {
      clearTimeout(deadline)
      signal.removeEventListener("abort", aborted)
      void worker.terminate()
      outcome()
    }
    const aborted = () => settle(() => reject(new Error("the step was aborted")))
    signal.addEventListener("abort", aborted, { once: true })
    worker.on("error", (error) => settle(() => reject(error)))
    worker.on("message", (message: { readonly ready?: true; readonly ms?: number; readonly error?: string }) => {
      if (message.ready) {
        deadline = setTimeout(() =>
          settle(() =>
            reject(
              new Error(
                `the query "${source}" ran for more than ${seconds} s and was stopped, after ${samples.length} of ${timedRuns} runs${
                  samples.length > 0 ? ` (the slowest ${Math.max(...samples).toFixed(0)} ms)` : ""
                }`
              )
            )
          ), seconds * 1000)
      } else if (message.error !== undefined) {
        settle(() => reject(new Error(`invalid query "${source}": ${message.error}`)))
      } else if (message.ms !== undefined) {
        samples.push(message.ms)
        if (samples.length === timedRuns) settle(() => resolve(samples))
      }
    })
  })

const median = (samples: ReadonlyArray<number>) => [...samples].sort((a, b) => a - b)[samples.length >> 1]!

const queried = (world: World) => {
  assert.ok(world.result, `query failed: ${world.queryError ?? "no query was run"}`)
  return world.result
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // Kinds, maturities and relations in turn, each edge joining two nodes drawn at random: every edge
  // is one of its own, so a question walks as far as it would.
  Given("a random graph of {int} nodes and {int} edges", ({ args: [nodes, edges], world }) => {
    world.randomGraphSize = { nodes, edges }
  })

  // The median of seven runs, each over the graph in memory; one run is the parse and the evaluation.
  When("the query {string} runs on it, for at most {int} seconds", async ({ args: [source, seconds], signal, world }) => {
    const graph = world.randomGraphSize
    assert.ok(graph, "draw a random graph first")
    world.durationMs = median(await timeInWorker(graph, source, seconds, signal))
  })

  // Specs S1 … Sn of the kind `node`, each linking every other: n × (n − 1) links of that relation.
  Given("{int} specs, each linked to every other by {string}", ({ args: [count, rel], world }) => {
    for (let i = 1; i <= count; i++) {
      const links = Array.from({ length: count }, (_, j) => j + 1).filter((j) => j !== i).map((j) => `@${rel}:S${j}`)
      setFile(world, `specs/S${i}.feature`, `@id=S${i} @kind=node\n${links.join(" ")}\nFeature: S${i}\n`)
    }
  })

  // A symbolic link in the scenario's directory, which leads nowhere when its target is not there.
  Given("the file {string} is a symbolic link to {string}", async ({ args: [path, target], world }) => {
    const at = join(await directoryOf(world), path)
    await mkdir(dirname(at), { recursive: true })
    await symlink(target, at)
  })

  // scripts/bench/generate.ts's workspace, written to the scenario's directory.
  Given("a generated workspace of {int} specs and {int} source files on disk", async ({ args: [specs, files], world }) => {
    await generateWorkspace(await directoryOf(world), { specs, files })
  })

  // A command run once for the file system's and Node's caches, then timed: its median is the
  // scenario's time, and the last run is the command to assert on.
  When("{string} runs {int} times after a run that warms it up", async ({ args: [command, runs], signal, world }) => {
    const directory = await workspace(world)
    await exec(command, directory, "", signal)
    const samples: Array<number> = []
    let last: Awaited<ReturnType<typeof exec>> | undefined
    for (let i = 0; i < runs; i++) {
      const started = performance.now()
      last = await exec(command, directory, "", signal)
      samples.push(performance.now() - started)
    }
    assert.ok(last, "run it at least once")
    world.durationMs = median(samples)
    record(world, command, last)
  })

  When("I query {string}", ({ args: [q], world }) =>
    Effect.map(load(world), (project) => {
      const result = queryProject(project, q)
      world.result = Result.isSuccess(result) ? result.success : undefined
      world.queryError = Result.isFailure(result) ? result.failure.message : undefined
    }))

  Then("the result is {string}", ({ args: [expected], world }) => {
    assert.ok(world.result, `query failed: ${world.queryError}`)
    assert.deepEqual(world.result.nodes.map((n) => n.id).sort(), ids(expected))
  })

  Then("the paths are:", ({ table, world }) =>
    assertRows("paths", queried(world).paths.map((p) => ({ path: formatPath(p) })), [["path"], ...(table ?? [])], "exactly"))
})
