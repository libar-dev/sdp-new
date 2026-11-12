import { describe, expect, it } from "vitest"
import { defaults } from "../src/model/Config.ts"
import { scanAnnotations } from "../src/parse/Annotations.ts"
import { parseGherkinFences } from "../src/parse/Gherkin.ts"
import { countAbstractions } from "../src/parse/Inventory.ts"
import { parseMarkdown } from "../src/parse/Markdown.ts"
import { parseMarkdownSpec } from "../src/parse/Spec.ts"

const md = (lines: ReadonlyArray<string>) => lines.join("\n")

describe("Markdown", () => {
  it("reads front matter, headings, fences and a summary with exact lines", () => {
    const doc = parseMarkdown(md([
      "---",
      "id: REQ-a",
      "tags: [x]",
      "---",
      "# Title",
      "",
      "First paragraph",
      "continues here.",
      "",
      "```gherkin",
      "Scenario: s",
      "```"
    ]))
    expect(doc.frontMatter).toEqual({ id: "REQ-a", tags: ["x"] })
    expect(doc.title).toBe("Title")
    expect(doc.summary).toBe("First paragraph continues here.")
    expect(doc.fences).toEqual([{ lang: "gherkin", line: 10, contentLine: 11, lines: ["Scenario: s"] }])
  })

  it("finds plain and typed links outside code", () => {
    const doc = parseMarkdown(md([
      "See [[DEC-1]] and [[DEC-2|the other one]].",
      "realized-by:: [[ARCH-a]], [[ARCH-b]]",
      "Not this: `[[DEC-9]]`",
      "```",
      "[[DEC-8]]",
      "```"
    ]))
    expect(doc.references).toEqual([
      { id: "DEC-1", line: 1 },
      { id: "DEC-2", line: 1 },
      { id: "ARCH-a", line: 2, rel: "realized-by" },
      { id: "ARCH-b", line: 2, rel: "realized-by" }
    ])
  })

  it("collects open questions until the next heading of the same level", () => {
    const doc = parseMarkdown(md(["## Open questions", "- [ ] a?", "- [x] b", "- ~~c~~", "- d", "## Next", "- not a question"]))
    expect(doc.openQuestions.map((q) => [q.text, q.resolved])).toEqual([["a?", false], ["b", true], ["~~c~~", true], ["d", false]])
  })

  it("reports broken front matter instead of throwing", () => {
    expect(parseMarkdown("---\nid: [unclosed\n---\n").frontMatterError).toBeDefined()
    expect(parseMarkdown("---\n- a list\n---\n").frontMatterError).toMatch(/mapping/)
  })
})

describe("Gherkin in Markdown", () => {
  const fences = (doc: string) => parseMarkdown(doc).fences

  it("maps scenario and step lines back to the Markdown file", () => {
    const result = parseGherkinFences({
      specId: "REQ-a",
      title: "A",
      tags: ["area"],
      fences: fences(md(["# A", "", "```gherkin", "Background:", "  Given ctx", "", "Scenario: one", "  When x", "  Then y", "```"]))
    })
    expect(result.errors).toEqual([])
    const [scenario] = result.scenarios
    expect(scenario?.id).toBe("REQ-a#one")
    expect(scenario?.line).toBe(7)
    expect(scenario?.pickles[0]?.steps.map((s) => [s.keyword, s.text, s.line])).toEqual([
      ["Given", "ctx", 5],
      ["When", "x", 8],
      ["Then", "y", 9]
    ])
    expect(scenario?.pickles[0]?.tags).toEqual(["@area"])
    expect(scenario?.hasOutcome).toBe(true)
  })

  it("joins several blocks into one feature and de-duplicates scenario ids", () => {
    const result = parseGherkinFences({
      specId: "S",
      title: "S",
      tags: [],
      fences: fences(md(["```gherkin", "Scenario: same", "  Given a", "```", "text", "```gherkin", "Scenario: same", "  Given b", "```"]))
    })
    expect(result.scenarios.map((s) => [s.id, s.line])).toEqual([["S#same", 2], ["S#same-2", 7]])
  })

  it("does not mistake a Feature line inside a doc string for a feature header", () => {
    const result = parseGherkinFences({
      specId: "S",
      title: "S",
      tags: [],
      fences: fences(md(["```gherkin", "Scenario: s", "  Given a file:", "    \"\"\"", "    Feature: inner", "    \"\"\"", "```"]))
    })
    expect(result.errors).toEqual([])
    expect(result.scenarios[0]?.pickles[0]?.steps[0]?.docString).toBe("Feature: inner")
  })

  it("reports syntax errors at the Markdown line", () => {
    const result = parseGherkinFences({ specId: "S", title: "S", tags: [], fences: fences(md(["text", "```gherkin", "Scenario: s", "  Given a", "  Givne b", "```"])) })
    expect(result.errors[0]?.line).toBe(5)
  })

  it("changes the scenario hash when executable content changes", () => {
    const parse = (step: string) =>
      parseGherkinFences({ specId: "S", title: "S", tags: [], fences: fences(md(["```gherkin", "Scenario: s", `  Given ${step}`, "```"])) })
        .scenarios[0]!.hash
    expect(parse("a")).toBe(parse("a"))
    expect(parse("a")).not.toBe(parse("b"))
  })
})

describe("Spec", () => {
  it("infers kind from the id prefix and normalises every link shape", () => {
    const { spec } = parseMarkdownSpec(
      "specs/x.md",
      md([
        "---",
        "id: REQ-x",
        "links:",
        "  refines: CAP-a",
        "  uses: [ARCH-a, ARCH-b]",
        "  calls: { to: ARCH-c, via: http }",
        "---",
        "# X"
      ]),
      defaults
    )
    expect(spec?.kind).toBe("requirement")
    expect(spec?.links.map((l) => [l.rel, l.to, l.line])).toEqual([
      ["refines", "CAP-a", 4],
      ["uses", "ARCH-a", 5],
      ["uses", "ARCH-b", 5],
      ["calls", "ARCH-c", 6]
    ])
    expect(spec?.links[3]?.attrs).toEqual({ via: "http" })
  })

  it("ignores Markdown without an id but warns when it looks like a spec", () => {
    expect(parseMarkdownSpec("README.md", "# Readme", defaults).spec).toBeUndefined()
    expect(parseMarkdownSpec("x.md", "---\nkind: decision\n---\n", defaults).diagnostics[0]?.rule).toBe("missing-id")
  })
})

describe("Annotations", () => {
  it("binds to the declaration directly below, or to the file after a blank line", () => {
    const found = scanAnnotations(
      "src/a.ts",
      md([
        "// @sdp is ARCH-a kind=element significant=true title=\"A thing\"",
        "",
        "/** @sdp implements REQ-x, REQ-y */",
        "export class Service {}",
        "# @sdp uses ARCH-b",
        "def run(): pass"
      ])
    )
    expect(found.map((a) => [a.rel, a.targets, a.symbol, a.line])).toEqual([
      ["is", ["ARCH-a"], undefined, 1],
      ["implements", ["REQ-x", "REQ-y"], "Service", 3],
      ["uses", ["ARCH-b"], "run", 5]
    ])
    expect(found[0]?.attrs).toEqual({ kind: "element", significant: true, title: "A thing" })
  })

  it("ignores prose that merely mentions the marker", () => {
    expect(scanAnnotations("src/a.ts", "// write `@sdp <rel> <ID>` above a symbol")).toEqual([])
  })
})

describe("Inventory", () => {
  it("counts exported abstractions per language", () => {
    expect(countAbstractions("a.ts", "export class A {}\nexport const b = 1\nconst c = 2\nexport type D = {}", undefined)).toBe(3)
    expect(countAbstractions("a.go", "type Public struct{}\ntype private struct{}\nfunc Do() {}", undefined)).toBe(2)
    expect(countAbstractions("a.md", "export class A {}", undefined)).toBe(0)
    expect(countAbstractions("a.txt", "X X", "X")).toBe(2)
  })
})
