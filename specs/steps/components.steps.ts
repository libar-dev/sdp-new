/**
 * Step definitions for component contracts: the spec parser, the code
 * annotation scanner, the graph builder and the query engine
 * (docs/architecture/ARCH-*.md), query paths (REQ-graph-query), and the
 * in-memory file system the pipeline runs on (ARCH-overview). Parser
 * and scanner steps call the component on one file of the in-memory
 * workspace; graph and query steps run the whole pipeline. Expectations are
 * data tables whose header names the columns checked, so a scenario states
 * only what it is about.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, FileSystem, Path, Result } from "effect"
import { strict as assert } from "node:assert"
import { formatPath, projectOrderings, query } from "../../src/graph/Query.ts"
import type { Diagnostic } from "../../src/model/Diagnostic.ts"
import { type Attrs, formatSource, type Graph } from "../../src/model/Graph.ts"
import { type Annotation, scanCode } from "../../src/parse/Annotations.ts"
import type { Scenario } from "../../src/parse/Gherkin.ts"
import { type ParsedFile, parseFeatureSpec, parseMarkdownSpec, type Spec } from "../../src/parse/Spec.ts"
import { defineSteps } from "../../src/run/Steps.ts"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { loadConfig, loadProject } from "../../src/workspace/Workspace.ts"
import { ids, load, newWorld, setFile, type World } from "./world.ts"

type Row = Readonly<Record<string, string>>
type Table = ReadonlyArray<ReadonlyArray<string>>

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // --- spec parser ----------------------------------------------------------

  When("{string} is parsed", ({ args: [path], world }) => parse(world, path))

  When("{string} is parsed with CRLF line endings and → as a tab", ({ args: [path], world }) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path}`)
    setFile(world, path, content.replaceAll("→", "\t").replaceAll("\n", "\r\n"))
    return parse(world, path)
  })

  When("{string} is parsed again after replacing {string} with {string}", ({ args: [path, text, replacement], world }) => {
    const content = world.files.get(path) ?? ""
    assert.ok(content.includes(text), `${path} does not contain ${JSON.stringify(text)}`)
    world.scratch.previous = world.scratch.parsed
    setFile(world, path, content.replace(text, replacement))
    return parse(world, path)
  })

  Then("the file is not a spec", ({ world }) => assert.equal(parsed(world).spec, undefined, "the file was parsed as a spec"))

  Then("the parsed spec has {word} {string}", ({ args: [key, expected], world }) => {
    const s = spec(world)
    const fields: Record<string, unknown> = { id: s.id, kind: s.kind, title: s.title, summary: s.summary, format: s.format }
    assert.equal(show(key in fields ? fields[key] : s.attrs[key]), expected, `${key} of the parsed spec`)
  })

  Then("the parsed spec has exactly these attributes:", ({ table, world }) =>
    assertRows("attributes", Object.entries(spec(world).attrs).map(([key, value]) => ({ key, value: show(value) })), table, "exactly"))

  Then("the parsed spec has attribute lines:", ({ table, world }) =>
    assertRows("attribute lines", Object.entries(spec(world).attrLines).map(([key, line]) => ({ key, line: String(line) })), table, "exactly"))

  Then("the parsed spec has links:", ({ table, world }) =>
    assertRows(
      "links",
      spec(world).links.map((link) => ({ rel: link.rel, to: link.to, line: String(link.line), attributes: attrsText(link.attrs) })),
      table,
      "in order"
    ))

  Then("the parsed spec has prose links:", ({ table, world }) =>
    assertRows(
      "prose links",
      spec(world).references.map((ref) => ({ to: ref.id, rel: ref.rel ?? "mentions", line: String(ref.line) })),
      table,
      "in order"
    ))

  Then("the parsed spec has open questions:", ({ table, world }) =>
    assertRows(
      "open questions",
      spec(world).openQuestions.map((q) => ({ question: q.text, resolved: q.resolved ? "yes" : "no", line: String(q.line) })),
      table,
      "in order"
    ))

  Then("the parsed spec has inline nodes:", ({ table, world }) =>
    assertRows(
      "inline nodes",
      spec(world).inlineNodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        line: String(n.line),
        attributes: attrsText(n.attrs),
        links: n.links.map((l) => `-${l.rel}-> ${l.to}`).join(", "),
        "link lines": n.links.map((l) => l.line).join(", ")
      })),
      table,
      "in order"
    ))

  Then("the parsed spec has scenarios:", ({ table, world }) =>
    assertRows(
      "scenarios",
      spec(world).scenarios.map((s) => ({ id: s.id, name: s.name, line: String(s.line), rule: s.rule ?? "" })),
      table,
      "in order"
    ))

  Then("the parsed spec has no open questions", ({ world }) =>
    assert.deepEqual(spec(world).openQuestions.map((q) => q.text), [], "the parsed spec has open questions"))

  Then("the parsed spec has no scenarios", ({ world }) =>
    assert.deepEqual(spec(world).scenarios.map((s) => s.id), [], "the parsed spec has scenarios"))

  Then("the executable steps of {string} are:", ({ args: [id], table, world }) =>
    assertRows(
      `executable steps of ${id}`,
      (scenario(spec(world), id).pickles[0]?.steps ?? []).map((step) => ({
        keyword: step.keyword,
        text: step.text,
        line: String(step.line),
        "doc string": step.docString ?? ""
      })),
      table,
      "in order"
    ))

  Then("the executable tags of {string} are {string}", ({ args: [id, expected], world }) =>
    assert.equal(scenario(spec(world), id).pickles[0]?.tags.join(", "), expected))

  Then("the hash of {string} changes", ({ args: [id], world }) => {
    const [before, after] = hashes(world, id)
    assert.notEqual(after, before, `the hash of ${id} did not change`)
  })

  Then("the hash of {string} stays the same", ({ args: [id], world }) => {
    const [before, after] = hashes(world, id)
    assert.equal(after, before, `the hash of ${id} changed`)
  })

  Then("parsing reports nothing", ({ world }) =>
    assertRows("parser diagnostics", parsed(world).diagnostics.map(parserRow), [["rule", "line", "message"]], "exactly"))

  Then("parsing reports:", ({ table, world }) =>
    assertRows("parser diagnostics", parsed(world).diagnostics.map(parserRow), table, "exactly"))

  // --- code annotations -----------------------------------------------------

  When("{string} is scanned for annotations", ({ args: [path], world }) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path}`)
    const scan = scanCode(path, content)
    world.scratch.annotations = scan.annotations
    world.scratch.annotationProblems = scan.unreadable
  })

  Then("the annotated {string} is declared at line {int} and described as {string}", ({ args: [target, line, doc], world }) => {
    const found = annotations(world).find((a) => (a.symbol ?? "the module") === target)
    assert.ok(found, `no annotation of ${target}`)
    assert.equal(found.symbolLine, line, `${target} is declared at line ${found.symbolLine}`)
    assert.equal(found.doc, doc)
  })

  Then("the scan reports at line {int}: {string}", ({ args: [line, message], world }) => {
    const problems = (world.scratch.annotationProblems ?? []) as ReadonlyArray<{ line: number; message: string }>
    assert.ok(
      problems.some((p) => p.line === line && p.message.includes(message)),
      `problems: ${JSON.stringify(problems)}`
    )
  })

  Then("the scan reports nothing", ({ world }) =>
    assert.deepEqual(world.scratch.annotationProblems ?? [], [], "the scan reported problems"))

  Then("the annotations are:", ({ table, world }) =>
    assertRows("annotations", annotations(world).map(annotationRow), table, "in order"))

  Then("no annotations are found", ({ world }) =>
    assertRows("annotations", annotations(world).map(annotationRow), [["line", "relation", "targets", "binds to"]], "exactly"))

  // --- graph builder --------------------------------------------------------

  Then("the workspace graph has exactly these nodes:", ({ table, world }) =>
    Effect.map(load(world), (project) =>
      assertRows(
        "nodes",
        [...project.graph.nodes.values()].map((n) => ({ id: n.id, kind: n.kind, title: n.title, source: formatSource(n.source) })),
        table,
        "exactly"
      )))

  Then("the workspace graph has edges:", ({ table, world }) =>
    Effect.map(load(world), (project) =>
      assertRows(
        "edges",
        project.graph.edges.map((e) => ({
          from: e.from,
          rel: e.rel,
          to: e.to,
          source: formatSource(e.source),
          attributes: attrsText(e.attrs)
        })),
        table,
        "including"
      )))

  Then("the workspace graph has no {string} edges", ({ args: [rel], world }) =>
    Effect.map(load(world), (project) => {
      const found = project.graph.edges.filter((e) => e.rel === rel)
      assert.equal(found.length, 0, found.map((e) => `${e.from} -${e.rel}-> ${e.to}`).join(", "))
    }))

  Then("the implicit edges are {string}", ({ args: [expected], world }) =>
    Effect.map(load(world), (project) =>
      assert.deepEqual(
        project.graph.edges.filter((e) => e.attrs?.implicit === true).map((e) => `${e.from} -${e.rel}-> ${e.to}`).sort(),
        ids(expected)
      )))

  Then("building the graph reports nothing", ({ world }) =>
    Effect.map(load(world), (project) => assertRows("graph diagnostics", project.diagnostics.map(builderRow), [["rule", "at", "message"]], "exactly")))

  Then("building the graph reports:", ({ table, world }) =>
    Effect.map(load(world), (project) => assertRows("graph diagnostics", project.diagnostics.map(builderRow), table, "exactly")))

  // --- memory and disk ------------------------------------------------------

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
    const [memory, disk] = graphs.map((graph) => [...graph.nodes.keys()].sort())
    assert.deepEqual(memory, ids(expected), "the nodes read from memory")
    assert.deepEqual(disk, ids(expected), "the nodes read from disk")
  })

  // --- query engine ---------------------------------------------------------

  Given("a chain of {int} nodes linked by {string}", ({ args: [count, rel], world }) => {
    const nodes = Array.from({ length: count }, (_, i) =>
      `  - { id: N${i + 1}, kind: node${i + 1 < count ? `, links: { ${rel}: N${i + 2} }` : ""} }`)
    setFile(world, "chain.md", `---\nid: CHAIN\nkind: chain\nnodes:\n${nodes.join("\n")}\n---\n# Chain\n`)
  })

  // Members M1…Mn of kind "member": n × (n-1) edges, so two hops make n × (n-1)² paths.
  Given("{int} nodes, each linked to all the others by {string}", ({ args: [count, rel], world }) => {
    const members = Array.from({ length: count }, (_, i) => `M${i + 1}`)
    const nodes = members.map((id) => `  - { id: ${id}, kind: member, links: { ${rel}: [${members.filter((m) => m !== id).join(", ")}] } }`)
    setFile(world, "mesh.md", `---\nid: MESH\nkind: mesh\nnodes:\n${nodes.join("\n")}\n---\n# Mesh\n`)
  })

  When("the query {string} runs on it with at most {int} paths", ({ args: [source, maxPaths], world }) => {
    assert.ok(world.graph, "generate a graph first")
    const result = query(world.graph, source, { maxPaths, orderings: projectOrderings(["idea", "draft", "specified", "ready"]) })
    if (Result.isFailure(result)) assert.fail(`query failed: ${result.failure.message}`)
    world.result = result.success
  })

  Then("the paths are:", ({ table, world }) =>
    assertRows("paths", queried(world).paths.map((p) => ({ path: formatPath(p) })), [["path"], ...(table ?? [])], "exactly"))

  Then("the result has {int} node(s)", ({ args: [count], world }) => assert.equal(queried(world).nodes.length, count))

  Then("the result has {int} path(s)", ({ args: [count], world }) => assert.equal(queried(world).paths.length, count))

  Then("the result is truncated", ({ world }) => assert.equal(queried(world).truncated, true, "the result is complete"))

  Then("the result is truncated because {string}", ({ args: [limit], world }) =>
    assert.deepEqual(queried(world).limits, [limit], "the limits that cut the result short"))

  Then("the result is complete", ({ world }) =>
    assert.equal(queried(world).truncated, false, `the result is cut short: ${queried(world).limits.join("; ")}`))
})

// ---------------------------------------------------------------------------

const parse = (world: World, path: string) =>
  Effect.map(loadConfig(memoryRoot).pipe(Effect.provide(layerMemoryWorkspace(world.files))), (config) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path}`)
    world.scratch.parsed = path.endsWith(".feature") ? parseFeatureSpec(path, content, config) : parseMarkdownSpec(path, content, config)
  })

const parsed = (world: World): ParsedFile => {
  const result = world.scratch.parsed as ParsedFile | undefined
  assert.ok(result, "parse a file first: When \"<path>\" is parsed")
  return result
}

const spec = (world: World): Spec => {
  const { diagnostics, spec } = parsed(world)
  assert.ok(spec, `the file is not a spec${diagnostics.length ? `: ${diagnostics.map((d) => d.message).join("; ")}` : ""}`)
  return spec
}

const scenario = (spec: Spec, id: string): Scenario => {
  const found = spec.scenarios.find((s) => s.id === id)
  assert.ok(found, `no scenario ${id}; scenarios are: ${spec.scenarios.map((s) => s.id).join(", ") || "none"}`)
  return found
}

const hashes = (world: World, id: string): readonly [string, string] => {
  const previous = (world.scratch.previous as ParsedFile | undefined)?.spec
  assert.ok(previous, "parse the file, then parse it again after an edit")
  return [scenario(previous, id).hash, scenario(spec(world), id).hash]
}

const annotations = (world: World): ReadonlyArray<Annotation> => {
  const found = world.scratch.annotations as ReadonlyArray<Annotation> | undefined
  assert.ok(found, "scan a file first: When \"<path>\" is scanned for annotations")
  return found
}

const annotationRow = (a: Annotation): Row => ({
  line: String(a.line),
  relation: a.rel,
  targets: a.targets.join(", "),
  "binds to": a.symbol ?? "the file",
  attributes: attrsText(a.attrs)
})

const queried = (world: World) => {
  assert.ok(world.result, `query failed: ${world.queryError ?? "no query was run"}`)
  return world.result
}

const parserRow = (d: Diagnostic): Row => ({ rule: d.rule, severity: d.severity, line: String(d.source?.line ?? ""), message: d.message })

const builderRow = (d: Diagnostic): Row => ({ rule: d.rule, severity: d.severity, at: formatSource(d.source), message: d.message })

/** Strings as written, lists comma-separated, anything else as JSON. */
const show = (value: unknown): string =>
  value === undefined ? "" : typeof value === "string" ? value : Array.isArray(value) ? value.map(show).join(", ") : JSON.stringify(value)

/** `key=value` pairs in the annotation syntax, values as JSON so types stay visible: `via="events" tier=1`. */
const attrsText = (attrs: Attrs | undefined): string =>
  Object.entries(attrs ?? {}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")

/**
 * Compares rows with a table whose header names the columns to check. A `message` cell
 * matches when the actual message contains it; every other cell must be equal.
 */
const assertRows = (
  what: string,
  actual: ReadonlyArray<Row>,
  table: Table | undefined,
  mode: "exactly" | "in order" | "including"
) => {
  assert.ok(table && table.length > 0, `expected a table of ${what}`)
  const columns = table[0]!.map((cell) => cell.trim())
  const expected = table.slice(1).map((cells): Row => Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ""])))
  const matches = (row: Row, want: Row) =>
    columns.every((column) => column === "message" ? (row[column] ?? "").includes(want[column]!) : (row[column] ?? "") === want[column])
  const render = (rows: ReadonlyArray<Row>) =>
    rows.length === 0 ? "  (none)" : rows.map((row) => `  | ${columns.map((column) => row[column] ?? "").join(" | ")} |`).join("\n")
  const fail = () => assert.fail(`${what} differ\nexpected (${mode}):\n${render(expected)}\nactual:\n${render(actual)}`)
  if (mode === "in order") {
    if (actual.length !== expected.length || !expected.every((want, i) => matches(actual[i]!, want))) fail()
    return
  }
  const remaining = [...actual]
  for (const want of expected) {
    const index = remaining.findIndex((row) => matches(row, want))
    if (index < 0) fail()
    remaining.splice(index, 1)
  }
  if (mode === "exactly" && remaining.length > 0) fail()
}
