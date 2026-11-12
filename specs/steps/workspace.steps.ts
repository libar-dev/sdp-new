/**
 * The workspace a scenario is about: the files it is given, the graph sdp builds from them, what
 * a query answers and what sdp reports about them. Everything here runs the real pipeline in
 * memory; cli.steps.ts runs the same files through the command line.
 */
import { Effect, FileSystem, Path, Result } from "effect"
import { strict as assert } from "node:assert"
import { cp, mkdir, symlink } from "node:fs/promises"
import { basename, join } from "node:path"
import * as Api from "../../src/index.ts"
import * as Reading from "../../src/app/Reading.ts"
import * as Text from "../../src/app/Text.ts"
import { contextBundle } from "../../src/graph/Context.ts"
import { graphRecords, jsonLines } from "../../src/graph/Export.ts"
import { formatPath, projectOrderings, query, queryProject } from "../../src/graph/Query.ts"
import { check } from "../../src/check/Check.ts"
import { formatSource, Graph, type GraphEdge, type GraphNode } from "../../src/model/Graph.ts"
import { defineSteps } from "sdp/steps"
import { defaultVocabulary } from "../../src/model/Vocabulary.ts"
import { layerMemoryWorkspace, loadMemoryProject, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { newId, newSpec } from "../../src/app/Templates.ts"
import { findFiles, loadProject } from "../../src/workspace/Workspace.ts"
import { statusSummary } from "../../src/graph/Status.ts"
import { assertRows, attrsText, ids, load, newWorld, node, produce, reload, reportRow, setFile, type World } from "./world.ts"
import { directoryOf, repository } from "./process.ts"

const reported = (world: World) => {
  assert.ok(world.reported, "nothing was parsed, loaded, checked or scanned yet")
  return world.reported
}

const queried = (world: World) => {
  assert.ok(world.result, `query failed: ${world.queryError ?? "no query was run"}`)
  return world.result
}

/** `draft:1 verified:2`, by stage name. */
const counted = (record: Readonly<Record<string, number>>) =>
  Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([stage, n]) => `${stage}:${n}`).join(" ") || "nothing"

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  Given("a file {string} containing:", ({ args: [path], doc, world }) => setFile(world, path, doc ?? ""))

  Given("the workspace is a copy of {string}", async ({ args: [source], world }) => {
    const directory = await directoryOf(world)
    // Its step definitions import "sdp/steps" with nothing installed: sdp resolves that import itself.
    await cp(join(repository, source), directory, {
      recursive: true,
      filter: (file) => ![".sdp", "node_modules"].includes(basename(file))
    })
  })

  // Linked as a package manager links a local package, so that a compiler resolves "sdp/annotations".
  Given("sdp is installed in the workspace", async ({ world }) => {
    const modules = join(await directoryOf(world), "node_modules")
    await mkdir(modules, { recursive: true })
    await symlink(repository, join(modules, "sdp"), "junction")
  })

  // Each row joins the workspace before the next is created, as with `sdp new`.
  Given("specs created from the sdp new templates:", ({ table, world }) =>
    Effect.gen(function*() {
      const [header = [], ...rows] = table ?? []
      for (const row of rows) {
        const cell = (name: string) => row[header.indexOf(name)] ?? ""
        const project = yield* load(world)
        const created = newSpec({
          kind: cell("kind"),
          title: cell("title"),
          maturity: cell("maturity") || undefined,
          changes: cell("changes") || undefined,
          today: "2026-11-12",
          config: project.config,
          graph: project.graph
        })
        if (Result.isFailure(created)) assert.fail(created.failure)
        const { file } = created.success
        assert.ok(file, `sdp new ${cell("kind")} writes no file`)
        setFile(world, file.path, file.content)
      }
    }))

  // One spec per row, its tag line and the name of its Feature: the whole file, specs/<id>.feature.
  Given("these specs:", ({ table, world }) => {
    const [header = [], ...rows] = table ?? []
    const cell = (row: ReadonlyArray<string>, name: string) => row[header.indexOf(name)] ?? ""
    for (const row of rows) {
      const tags = cell(row, "tags")
      const id = /@id=(\S+)/.exec(tags)?.[1]
      assert.ok(id, `a spec needs an @id= tag: ${tags}`)
      setFile(world, `specs/${id}.feature`, `${tags}\nFeature: ${cell(row, "Feature")}\n`)
    }
  })

  Given("a chain of {int} nodes linked by {string}", ({ args: [count, rel], world }) => {
    for (let i = 1; i <= count; i++) {
      setFile(world, `specs/N${i}.feature`, `@id=N${i} @kind=node${i}${i < count ? ` @${rel}:N${i + 1}` : ""}\nFeature: N${i}\n`)
    }
  })

  // Members M1…Mn of kind "member": n × (n-1) edges, so two hops make n × (n-1)² paths.
  Given("{int} nodes, each linked to all the others by {string}", ({ args: [count, rel], world }) => {
    const members = Array.from({ length: count }, (_, i) => `M${i + 1}`)
    for (const id of members) {
      const links = members.filter((m) => m !== id).map((m) => `@${rel}:${m}`).join(" ")
      setFile(world, `specs/${id}.feature`, `@id=${id} @kind=member ${links}\nFeature: ${id}\n`)
    }
  })

  Given("a generated graph of {int} nodes and {int} edges", ({ args: [nodeCount, edgeCount], world }) => {
    const kinds = ["feature", "element", "decision", "scenario", "code"]
    const nodes: Array<GraphNode> = Array.from({ length: nodeCount }, (_, i) => ({
      id: `N${i}`,
      kind: kinds[i % kinds.length]!,
      title: `node ${i}`,
      attrs: { maturity: ["idea", "draft", "specified", "ready"][i % 4] }
    }))
    let seed = 42
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const rels = ["realized-by", "decided-by", "verifies", "depends-on"]
    const edges: Array<GraphEdge> = Array.from({ length: edgeCount }, (_, i) => ({
      from: `N${Math.floor(random() * nodeCount)}`,
      rel: rels[i % rels.length]!,
      to: `N${Math.floor(random() * nodeCount)}`
    }))
    world.graph = new Graph(nodes, edges)
  })

  Given("a generated workspace of {int} specs", ({ args: [count], world }) => {
    for (let i = 0; i < count; i++) {
      setFile(
        world,
        `specs/feature-${i}.feature`,
        `@id=feature-${i} @maturity=specified @depends-on:feature-${(i * 7) % count} @refines:feature-${(i * 3) % count}\nFeature: Feature ${i}\n\n` +
          `  Feature ${i} works.\n\n  Rule: It works\n\n    Scenario: Works\n      Given a thing ${i}\n      When it is used\n      Then it works\n`
      )
    }
  })

  When("the workspace is loaded", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.reported = project.diagnostics.map(reportRow)
    }))

  When("the workspace {string} is loaded from memory and from disk", ({ args: [directory], world }) =>
    Effect.gen(function*() {
      const fromMemory = yield* loadProject(`${memoryRoot}/${directory}`).pipe(Effect.provide(layerMemoryWorkspace(world.files)))
      const fromDisk = yield* Effect.scoped(Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped()
        for (const [file, content] of world.files) {
          yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true })
          yield* fs.writeFileString(path.join(root, file), content)
        }
        return yield* loadProject(path.join(root, directory))
      })).pipe(Effect.provide(NodeServices.layer))
      world.scratch.graphs = [fromMemory.graph, fromDisk.graph]
    }))

  Then("both graphs have exactly the nodes {string}", ({ args: [expected], world }) => {
    const graphs = world.scratch.graphs as ReadonlyArray<Graph> | undefined
    assert.ok(graphs, "load the workspace from memory and from disk first")
    const [memory, disk] = graphs.map((graph) => graph.nodes().map((node) => node.id).sort())
    assert.deepEqual(memory, ids(expected), "the nodes read from memory")
    assert.deepEqual(disk, ids(expected), "the nodes read from disk")
  })

  Then("loading the workspace fails with {string}", ({ args: [text], world }) =>
    Effect.gen(function*() {
      const outcome = yield* Effect.result(loadMemoryProject(world.files))
      assert.ok(Result.isFailure(outcome), "the workspace loaded")
      const error = outcome.failure as { readonly file?: string; readonly message?: string }
      const message = `${error.file ?? ""}: ${error.message ?? String(outcome.failure)}`
      assert.ok(message.includes(text), `error was ${JSON.stringify(message)}`)
    }))

  // Any attribute, or one of what every node has: kind, title, source (`file:line`).
  Then("node {string} has attribute {word} = {string}", ({ args: [id, key, value], world }) =>
    Effect.map(load(world), (project) => {
      const n = node(project, id)
      const actual = key === "title" ? n.title : key === "kind" ? n.kind : key === "source" ? formatSource(n.source) : n.attrs[key]
      assert.equal(String(actual), value, `${id}.${key}`)
    }))

  Then("the workspace graph has exactly these nodes:", ({ table, world }) =>
    Effect.map(load(world), (project) =>
      assertRows(
        "nodes",
        project.graph.nodes().map((n) => ({ id: n.id, kind: n.kind, title: n.title, source: formatSource(n.source) })),
        table,
        "exactly"
      )))

  Then("the workspace graph has edges:", ({ table, world }) =>
    Effect.map(load(world), (project) =>
      assertRows(
        "edges",
        project.graph.edges().map((e) => ({
          from: e.from,
          rel: e.rel,
          to: e.to,
          source: formatSource(e.source),
          sources: (e.sources ?? []).map(formatSource).join(", "),
          attributes: attrsText(e.attrs)
        })),
        table,
        "including"
      )))

  Then("the edges from {string} are {string}", ({ args: [from, expected], world }) =>
    Effect.map(load(world), (project) =>
      assert.deepEqual(project.graph.out(from).map((e) => `${e.from} -${e.rel}-> ${e.to}`).sort(), ids(expected))))

  When("I query {string}", ({ args: [q], world }) =>
    Effect.map(load(world), (project) => {
      const result = queryProject(project, q)
      world.result = Result.isSuccess(result) ? result.success : undefined
      world.queryError = Result.isFailure(result) ? result.failure.message : undefined
    }))

  When("the query {string} runs on it with at most {int} paths", ({ args: [source, maxPaths], world }) => {
    assert.ok(world.graph, "generate a graph first")
    const result = query(world.graph, source, { maxPaths, orderings: projectOrderings(defaultVocabulary) })
    if (Result.isFailure(result)) assert.fail(`query failed: ${result.failure.message}`)
    world.result = result.success
  })

  Then("the result is {string}", ({ args: [expected], world }) => {
    assert.ok(world.result, `query failed: ${world.queryError}`)
    assert.deepEqual(world.result.nodes.map((n) => n.id).sort(), ids(expected))
  })

  Then("the result has {int} node(s)", ({ args: [count], world }) => assert.equal(queried(world).nodes.length, count))

  Then("the result has {int} path(s)", ({ args: [count], world }) => assert.equal(queried(world).paths.length, count))

  Then("the paths are:", ({ table, world }) =>
    assertRows("paths", queried(world).paths.map((p) => ({ path: formatPath(p) })), [["path"], ...(table ?? [])], "exactly"))

  Then("the result is complete", ({ world }) =>
    assert.equal(queried(world).truncated, false, `the result is cut short: ${queried(world).limits.join("; ")}`))

  Then("the result is truncated because {string}", ({ args: [limit], world }) =>
    assert.deepEqual(queried(world).limits, [limit], "the limits that cut the result short"))

  Then("the query is rejected with {string}", ({ args: [message], world }) => {
    assert.ok(world.queryError, "expected the query to be rejected")
    assert.match(world.queryError, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
  })

  // The diagnostics of the last step that parsed a file, loaded or checked the workspace, or
  // scanned code. A table names the columns it checks: rule, severity, node, at (file:line), line,
  // message and hint, the last two matched by what they contain.
  When("the workspace is checked", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.reported = check(project).map(reportRow)
    }))

  Then("sdp reports nothing", ({ world }) => assertRows("diagnostics", reported(world), [["rule", "at", "message"]], "exactly"))

  // The rules of the diagnostics, each as often as it is reported; "nothing" for none.
  Then("sdp reports {string}", ({ args: [rules], world }) => assert.deepEqual(reported(world).map((row) => row.rule).sort(), ids(rules)))

  Then("sdp reports:", ({ table, world }) => assertRows("diagnostics", reported(world), table, "exactly"))

  Then("sdp reports at least:", ({ table, world }) => assertRows("diagnostics", reported(world), table, "including"))

  Then("sdp does not report {string}", ({ args: [rule], world }) =>
    assertRows("diagnostics", reported(world).filter((row) => row.rule === rule), [["rule", "at", "message"]], "exactly"))

  When("I ask for the architecture view", ({ world }) =>
    Effect.map(Reading.architecture(memoryRoot), (answer) => {
      produce(world, Text.architecture(answer.data))
    }).pipe(Effect.provide(layerMemoryWorkspace(world.files))))

  // The bundle as it is before any step file is read: what a run recorded is all it knows of the steps.
  When("I ask for the context of {string}", ({ args: [id], world }) =>
    Effect.map(load(world), (project) => {
      produce(world, contextBundle(project, node(project, id)))
    }))

  When("the graph is exported", ({ world }) =>
    Effect.map(load(world), (project) => {
      produce(world, jsonLines(graphRecords(project.graph)))
    }))

  // The programmatic API as a program calls it: `query` from the package's entry point, on these files.
  When("a program asks the API for {string}", ({ args: [expression], world }) =>
    Effect.map(Api.query(memoryRoot, { expression }), (answer) => {
      produce(world, JSON.stringify(answer, null, 2))
    }).pipe(Effect.provide(layerMemoryWorkspace(world.files))))

  Then("sdp status counts the stages {string}", ({ args: [expected], world }) =>
    Effect.map(load(world), (project) => {
      const stages = statusSummary(project).stages
      assert.equal(counted(stages), expected)
    }))

  Then("sdp run loads the step modules {string}", ({ args: [expected], world }) =>
    Effect.gen(function*() {
      const { config } = yield* load(world)
      const files = yield* findFiles(memoryRoot, config.steps, config.exclude).pipe(
        Effect.provide(layerMemoryWorkspace(world.files))
      )
      assert.deepEqual(files, ids(expected))
    }))

  Then("a new {word} titled {string} gets the id {string}", ({ args: [kind, title, expected], world }) =>
    Effect.map(load(world), (project) =>
      assert.equal(newId(kind, title, project.config, project.graph.nodes().map((n) => n.id)), expected)))
})
