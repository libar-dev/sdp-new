import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { Layer, Path } from "effect"
import { registrations } from "../src/mcp/Server.ts"
import { builtinSteps } from "../src/run/Builtin.ts"
import { runScenarios } from "../src/run/Runner.ts"
import { defineSteps, Pending } from "../src/run/Steps.ts"
import { layerMemory, loadMemoryProject, memoryRoot } from "../src/workspace/MemoryFileSystem.ts"

const specWith = (gherkin: string) =>
  new Map([["specs/S.md", `---\nid: S\nmaturity: ready\n---\n# S\n\nDescribed.\n\n\`\`\`gherkin\n${gherkin}\n\`\`\`\n`]])

const run = (gherkin: string, modules: Parameters<typeof runScenarios>[0]["modules"], timeout?: string) =>
  Effect.gen(function*() {
    const project = yield* loadMemoryProject(specWith(gherkin))
    const results = yield* runScenarios({ project, modules, timeout: timeout as never })
    return Object.values(results.scenarios)
  })

describe("runner", () => {
  it.effect("passes typed arguments, doc strings and tables; keeps one world per scenario", () =>
    Effect.gen(function*() {
      const seen: Array<unknown> = []
      const steps = defineSteps(() => ({ count: 0 }), ({ Given, Then, When }) => {
        Given("{int} apples at {float}", ({ args: [n, price], world }) => {
          world.count += n
          seen.push(typeof n, typeof price)
        })
        When("I note:", ({ doc, table }) => void seen.push(doc ?? table))
        Then("I have {int} apples", ({ args: [n], world }) => {
          if (world.count !== n) throw new Error(`have ${world.count}`)
        })
      })
      const [first, second] = yield* run(
        [
          "Scenario: a",
          "  Given 2 apples at 0.5",
          "  When I note:",
          "    \"\"\"",
          "    hello",
          "    \"\"\"",
          "  Then I have 2 apples",
          "Scenario: b",
          "  Given 1 apples at 1.0",
          "  When I note:",
          "    | x |",
          "  Then I have 1 apples"
        ].join("\n"),
        [steps]
      )
      expect([first?.status, second?.status]).toEqual(["passed", "passed"])
      expect(seen).toEqual(["number", "number", "hello", "number", "number", [["x"]]])
      expect(first?.pickles[0]?.steps[0]?.definition).toMatch(/run\.test\.ts:\d+$/)
    }))

  it.live("supports Effect and Promise handlers, pending, ambiguity, timeouts and skips the rest", () =>
    Effect.gen(function*() {
      const steps = defineSteps(() => ({}), ({ Step }) => {
        Step("effect ok", () => Effect.void)
        Step("promise fails", () => Promise.reject(new Error("nope")))
        Step("effect fails", () => Effect.fail(new Error("bad")))
        Step("throws pending", () => {
          throw new Pending({ reason: "later" })
        })
        Step("twice", () => {})
        Step(/^tw.ce$/, () => {})
        Step("slow", () => Effect.sleep("1 second"))
      })
      const results = yield* run(
        [
          "Scenario: promise",
          "  Given effect ok",
          "  When promise fails",
          "  Then effect ok",
          "Scenario: effect",
          "  Given effect fails",
          "Scenario: pending",
          "  Given throws pending",
          "Scenario: ambiguous",
          "  Given twice",
          "Scenario: undefined",
          "  Given nobody wrote this",
          "Scenario: slow",
          "  Given slow"
        ].join("\n"),
        [steps],
        "50 millis"
      )
      expect(results.map((r) => r.status)).toEqual(["failed", "failed", "pending", "ambiguous", "undefined", "failed"])
      expect(results[0]?.pickles[0]?.steps.map((s) => s.status)).toEqual(["passed", "failed", "skipped"])
      expect(results[0]?.pickles[0]?.steps[1]?.error).toBe("nope")
      expect(results[2]?.pickles[0]?.steps[0]?.error).toBe("later")
      expect(results[5]?.pickles[0]?.steps[0]?.error).toBe("step timed out")
      expect(results[4]?.pickles[0]?.steps[0]?.snippet).toContain("Given(\"nobody wrote this\"")
    }))

  it.effect("built-in steps assert against the project graph", () =>
    Effect.gen(function*() {
      const results = yield* run(
        [
          "Scenario: graph",
          "  Then the query \"spec\" returns 1 result",
          "  And the node \"S\" has maturity \"ready\"",
          "  And the significance ratio is at most 10%",
          "Scenario: failing",
          "  Then the query \"spec\" returns no results"
        ].join("\n"),
        [builtinSteps]
      )
      expect(results.map((r) => [r.status, r.pickles[0]?.steps.find((s) => s.error)?.error])).toEqual([["passed", undefined], ["failed", expect.anything()]])
      expect(results[1]?.pickles[0]?.steps[0]?.error).toContain("S (spec) specs/S.md:1")
    }))
})

describe("MCP", () => {
  it.effect("exposes the toolkit", () =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      const tools = yield* client.listTools()
      expect(tools.tools.map((t) => t.name).sort()).toEqual([
        "sdp_architecture",
        "sdp_check",
        "sdp_context",
        "sdp_query",
        "sdp_show",
        "sdp_status"
      ])
      const result = yield* client.callTool({ name: "sdp_query", arguments: { expression: "requirement[" } })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result.content)).toContain("unbalanced")
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(layerMemory(specWith("Scenario: s\n  Then x")), Path.layer))))
})
