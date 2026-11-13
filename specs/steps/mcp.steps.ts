/**
 * The MCP server as a client sees it: in memory, in this process on the files on disk, and as the
 * process `sdp mcp` starts.
 */
import { Effect, Predicate } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { instructions, registrations } from "../../src/mcp/Server.ts"
import { defineSteps } from "sdp/steps"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { ids, newWorld, output, produce, type World } from "./world.ts"
import { exec, workspace } from "./process.ts"

type Tool = { readonly name: string; readonly annotations?: Readonly<Record<string, unknown>> | undefined }

const listed = (world: World): ReadonlyArray<Tool> => {
  const tools = world.scratch.tools as ReadonlyArray<Tool> | undefined
  assert.ok(tools, "list the MCP tools first")
  return tools
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // A tool error and a rejected call (invalid arguments) both count as the tool reporting an error.
  When("an agent calls the MCP tool {string} with:", ({ args: [tool], doc, world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      const result = yield* client.callTool({ name: tool, arguments: JSON.parse(doc ?? "{}") })
      produce(world, result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"))
      world.scratch.mcpError = result.isError === true
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          produce(world, Predicate.hasProperty(error, "message") ? String(error.message) : String(error))
          world.scratch.mcpError = true
        })
      ),
      Effect.scoped,
      Effect.provide(layerMemoryWorkspace(world.files))
    ))

  // A server in this very process, on the files on disk: like a long-running `sdp mcp`, every call
  // shares one module cache, so it shows whether edits to step files are seen.
  When("an agent calls the MCP tool {string} on the workspace directory with:", ({ args: [tool], doc, world }) =>
    Effect.gen(function*() {
      const directory = yield* Effect.promise(() => workspace(world))
      const client = yield* McpTest.makeClient(registrations(directory), { protocols: [McpProtocol.v2025_11_25] })
      const result = yield* client.callTool({ name: tool, arguments: JSON.parse(doc ?? "{}") })
      produce(world, result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"))
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)))

  When("an MCP client of {string} calls {string} with:", async ({ args: [command, tool], doc, world }) => {
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
    const result = await exec(command, await workspace(world), messages.map((m) => `${JSON.stringify(m)}\n`).join(""))
    const replies = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line))
    const reply = replies.find((m) => m.id === 2)
    assert.ok(reply?.result, `no reply to tools/call:\n${result.stdout}${result.stderr}`)
    const text: string = reply.result.content.map((c: { text?: string }) => c.text ?? "").join("\n")
    produce(world, text, { line: command, code: result.code, stdout: text })
  })

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

  // The MCP call step (sdp.steps.ts) records whether the tool answered with an error.
  Then("the MCP tool reports an error", ({ world }) => {
    assert.equal(world.scratch.mcpError, true, `expected a tool error, got:\n${output(world)}`)
  })
})
