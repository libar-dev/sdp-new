import { describe, expect, it } from "@effect/vitest"
import { Effect, Result } from "effect"
import { check } from "../src/check/Check.ts"
import { contextBundle } from "../src/graph/Context.ts"
import { exportGraph } from "../src/graph/Export.ts"
import { parseQuery, projectOrderings, query } from "../src/graph/Query.ts"
import { Graph } from "../src/model/Graph.ts"
import { loadMemoryProject } from "../src/workspace/MemoryFileSystem.ts"

const workspace = (files: Record<string, string>) => new Map(Object.entries(files))

const spec = (front: string, body = "# T\n\nSome description.") => `---\n${front}\n---\n${body}\n`

describe("graph building", () => {
  it.effect("turns specs, inline nodes, implicit links and code annotations into one graph", () =>
    Effect.gen(function*() {
      const project = yield* loadMemoryProject(workspace({
        "plan.md": spec("id: PLAN\nkind: plan\nnodes:\n  - { id: E1, kind: iteration }"),
        "specs/REQ-a.md": spec("id: REQ-a\nmaturity: draft\niteration: E1\nlinks:\n  realized-by: ARCH-x"),
        "src/x.ts": "// @sdp is ARCH-x title=\"X service\"\nexport class X {}\n// @sdp implements REQ-a\nexport function f() {}"
      }))
      const g = project.graph
      expect(g.node("E1")?.kind).toBe("iteration")
      expect(g.node("ARCH-x")).toMatchObject({ kind: "element", title: "X service" })
      const edges = g.edges.map((e) => `${e.from} -${e.rel}-> ${e.to}`)
      expect(edges).toContain("REQ-a -iteration-> E1")
      expect(edges).toContain("REQ-a -realized-by-> ARCH-x")
      expect(edges).toContain("code:src/x.ts#X -is-> ARCH-x")
      expect(edges).toContain("code:src/x.ts#f -implements-> REQ-a")
      expect(edges.some((e) => e.includes("declaredIn"))).toBe(false)
      expect(project.diagnostics).toEqual([])
    }))

  it.effect("reports duplicate ids and keeps dangling references as missing nodes", () =>
    Effect.gen(function*() {
      const project = yield* loadMemoryProject(workspace({
        "a.md": spec("id: REQ-a\nlinks: { uses: ARCH-ghost }"),
        "b.md": spec("id: REQ-a")
      }))
      expect(project.diagnostics.map((d) => d.rule).sort()).toEqual(["dangling-link", "duplicate-id"])
      expect(project.graph.node("ARCH-ghost")?.kind).toBe("missing")
    }))

  it.effect("reads its config file", () =>
    Effect.gen(function*() {
      const project = yield* loadMemoryProject(workspace({
        "sdp.config.yaml": "specs: [\"docs/**/*.md\"]\nids: { requirement: STORY }",
        "docs/a.md": spec("id: STORY-1"),
        "other/b.md": spec("id: REQ-b")
      }))
      expect([...project.graph.nodes.keys()]).toEqual(["STORY-1"])
      expect(project.graph.node("STORY-1")?.kind).toBe("requirement")
    }))
})

describe("query", () => {
  const graph = new Graph(
    [
      { id: "R1", kind: "requirement", title: "One", attrs: { maturity: "ready", tags: ["checkout", "web"] } },
      { id: "R2", kind: "requirement", title: "Two", attrs: { maturity: "idea", estimate: 8 } },
      { id: "A", kind: "element", title: "A", attrs: { significant: true } },
      { id: "B", kind: "element", title: "B", attrs: {} },
      { id: "C", kind: "element", title: "C", attrs: {} }
    ],
    [
      { from: "R1", rel: "realized-by", to: "A" },
      { from: "R2", rel: "realized-by", to: "B" },
      { from: "A", rel: "depends-on", to: "B" },
      { from: "B", rel: "depends-on", to: "C" },
      { from: "C", rel: "depends-on", to: "A" }
    ]
  )
  const ids = (q: string) => {
    const result = query(graph, q, { orderings: projectOrderings(["idea", "draft", "specified", "ready"]) })
    if (Result.isFailure(result)) throw new Error(result.failure.message)
    return result.success.nodes.map((n) => n.id).sort()
  }

  it("filters on arrays, numbers and the maturity ladder", () => {
    expect(ids("requirement[tags=web]")).toEqual(["R1"])
    expect(ids("requirement[estimate>5]")).toEqual(["R2"])
    expect(ids("requirement[maturity>idea]")).toEqual(["R1"])
    expect(ids("*[kind=requirement|element, title~^[AB]$]")).toEqual(["A", "B"])
  })

  it("follows edges in, out and both ways, with alternatives and closure", () => {
    expect(ids("#B -depends-on- *")).toEqual(["A", "C"])
    expect(ids("#B <-depends-on|realized-by- *")).toEqual(["A", "R2"])
    expect(ids("#A -depends-on+-> *")).toEqual(["B", "C"])
  })

  it("keeps or drops nodes by the existence of neighbours", () => {
    expect(ids("element ?<-realized-by- requirement[maturity=ready]")).toEqual(["A"])
    expect(ids("element !<-realized-by- *")).toEqual(["C"])
  })

  it("returns paths", () => {
    const result = query(graph, "requirement -realized-by-> element -depends-on-> *")
    expect(Result.isSuccess(result) && result.success.paths.length).toBe(2)
  })

  it("rejects malformed queries with a message", () => {
    expect(Result.isFailure(parseQuery(""))).toBe(true)
    expect(Result.isFailure(parseQuery("a[x=\"unterminated]"))).toBe(true)
    expect(Result.isFailure(parseQuery("a b"))).toBe(true)
    expect(Result.isFailure(parseQuery("a[!x=1]"))).toBe(true)
  })

  it("caps runaway path expansion", () => {
    const nodes = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, kind: "n", title: "", attrs: {} }))
    const edges = nodes.flatMap((a) => nodes.slice(0, 60).map((b) => ({ from: a.id, rel: "r", to: b.id })))
    const result = query(new Graph(nodes, edges), "n -r-> * -r-> *", { maxPaths: 1000 })
    expect(Result.isSuccess(result) && result.success.truncated).toBe(true)
  })
})

describe("check", () => {
  it.effect("enforces maturity gates, decision hygiene and significance curation", () =>
    Effect.gen(function*() {
      const project = yield* loadMemoryProject(workspace({
        "REQ-a.md": spec("id: REQ-a\nmaturity: specified"),
        "REQ-b.md": spec("id: REQ-b\nmaturity: someday"),
        "DEC-1.md": spec("id: DEC-1\nkind: decision\nstatus: superseded"),
        "DEC-2.md": spec("id: DEC-2\nkind: decision\nstatus: maybe"),
        "ARCH-a.md": spec("id: ARCH-a\nkind: element\nsignificant: true"),
        "ARCH-b.md": spec("id: ARCH-b\nkind: element\nsignificant: true\nrationale: hot path")
      }))
      const rules = check(project).map((d) => `${d.rule}:${d.node ?? ""}`)
      expect(rules).toEqual(expect.arrayContaining([
        "maturity-gate:REQ-a",
        "maturity-value:REQ-b",
        "decision-supersede:DEC-1",
        "decision-status:DEC-2",
        "significance-rationale:ARCH-a",
        "significance-justification:ARCH-a",
        "significance-budget:"
      ]))
    }))
})

describe("exports and context", () => {
  it.effect("writes one line per fact and a context bundle with curated architecture only", () =>
    Effect.gen(function*() {
      const project = yield* loadMemoryProject(workspace({
        "REQ-a.md": spec("id: REQ-a\nmaturity: idea\nlinks: { realized-by: [ARCH-s, ARCH-n] }"),
        "ARCH-s.md": spec("id: ARCH-s\nkind: element\nsignificant: true\nrationale: hot path\nlinks: { decided-by: DEC-1 }"),
        "ARCH-n.md": spec("id: ARCH-n\nkind: element"),
        "DEC-1.md": spec("id: DEC-1\nkind: decision\nstatus: accepted")
      }))
      const g = project.graph
      expect(exportGraph(g, "jsonl").trimEnd().split("\n")).toHaveLength(g.nodes.size + g.edges.length)
      expect(exportGraph(g, "tsv")).toContain("edge\tREQ-a\trealized-by\tARCH-s\tREQ-a.md:4")
      expect(exportGraph(g, "dot")).toContain("digraph")
      const bundle = contextBundle(project, "REQ-a")!
      expect(bundle).toContain("## Significant architecture within 2 hops")
      expect(bundle).toContain("rationale: hot path")
      expect(bundle).toContain("DEC-1")
      expect(bundle.split("## Significant")[1]).not.toContain("ARCH-n")
    }))
})
