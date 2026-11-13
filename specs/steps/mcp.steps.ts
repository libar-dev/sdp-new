/**
 * The MCP server as a client sees it: in memory and as the process `sdp mcp` starts.
 */
import { Effect, Predicate, Schema } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { instructions, registrations } from "../../src/mcp/Server.ts"
import { defineSteps } from "sdp/steps"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { exitCode, ids, newWorld, output, produce, type World } from "./world.ts"
import { execute, workspace } from "./process.ts"

const errorState = "Then the MCP tool reports an error"
const Reply = Schema.Struct({
  id: Schema.optional(Schema.Union([Schema.String, Schema.Number, Schema.Null])),
  result: Schema.optional(Schema.Unknown)
})
const ToolAnswer = Schema.Struct({
  content: Schema.Array(Schema.Struct({ text: Schema.optional(Schema.String) })),
  isError: Schema.optional(Schema.Boolean)
})

type Tool = { readonly name: string; readonly annotations?: Readonly<Record<string, unknown>> | undefined }

const listed = (world: World): ReadonlyArray<Tool> => {
  const tools = world.scratch.tools as ReadonlyArray<Tool> | undefined
  assert.ok(tools, "list the MCP tools first")
  return tools
}

export default defineSteps(newWorld, ({ Then, When }) => {
  // A tool error and a rejected call (invalid arguments) both count as the tool reporting an error.
  When("an agent calls the MCP tool {string} with:", ({ args: [tool], doc, world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      const result = yield* client.callTool({ name: tool, arguments: JSON.parse(doc ?? "{}") })
      const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n")
      produce(world, text, { line: tool, code: result.isError === true ? 1 : 0, stdout: text, state: errorState })
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          const text = Predicate.hasProperty(error, "message") ? String(error.message) : String(error)
          produce(world, text, { line: tool, code: 1, stdout: text, state: errorState })
        })
      ),
      Effect.scoped,
      Effect.provide(layerMemoryWorkspace(world.files))
    ))

  When("an MCP client of {string} calls {string} with:", ({ args: [command, tool], doc, world }) =>
    Effect.gen(function*() {
      const messages = [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sdp-specs", version: "1" } }
        },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: JSON.parse(doc ?? "{}") } }
      ]
      const cwd = yield* Effect.promise(() => workspace(world))
      const result = yield* execute(command, cwd, messages.map((m) => `${JSON.stringify(m)}\n`).join(""))
      if (result.code !== 0) {
        produce(world, result.stdout + result.stderr, { line: command, code: result.code, stdout: result.stdout })
        return
      }
      const replies = result.stdout.split("\n").filter(Boolean).map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(Reply))(line))
      const reply = replies.find((m) => m.id === 2)
      assert.ok(reply?.result, `no reply to tools/call:\n${result.stdout}${result.stderr}`)
      const answer = Schema.decodeUnknownSync(ToolAnswer)(reply.result)
      const text = answer.content.map((c) => c.text ?? "").join("\n")
      produce(world, text, { line: command, code: answer.isError === true ? 1 : 0, stdout: text, state: errorState })
    }))

  When("an agent lists the MCP tools", ({ world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      world.scratch.tools = (yield* client.listTools()).tools
    }).pipe(Effect.scoped, Effect.provide(layerMemoryWorkspace(world.files))))

  When("an agent reads the MCP server's instructions", ({ world }) => {
    produce(world, instructions)
  })

  Then("the MCP tools are {string}", ({ args: [list], world }) => {
    assert.deepEqual(listed(world).map((tool) => tool.name).sort(), ids(list))
  })

  Then("every MCP tool is marked {string}", ({ args: [hints], world }) => {
    for (const tool of listed(world)) {
      for (const hint of hints.split(/,\s*/)) {
        assert.equal(tool.annotations?.[hint], true, `${tool.name} is not marked ${hint}: ${JSON.stringify(tool.annotations)}`)
      }
    }
  })

  // Either client records a tool error as exit code 1; stating it permits reading the answer.
  Then("the MCP tool reports an error", ({ world }) => {
    assert.equal(exitCode(world), 1, `expected a tool error, got:\n${output(world)}`)
  })
})
