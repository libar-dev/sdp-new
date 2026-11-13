/**
 * The agent plugin as a harness meets it: its one hook script, run as a harness runs a command
 * hook, what the hook showed the agent, and the files the plugin ships. The plugin is this
 * repository, as the package is. Also the work the plugin orients an agent on: features planned
 * into an iteration, and the records `sdp graph` prints.
 *
 * What a hook run leaves to assert on is what the harness shows of it, as Claude Code does: on exit
 * 0, what it adds to the agent's context; on any other exit, what it shows the person, the hook's
 * stderr, and the agent is shown nothing. A diagnostic a hook writes to stderr and exits 0 reaches
 * neither, so no example reads it. What these steps carry between them is kept on the scenario's world.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Duration, Effect, FileSystem, JsonSchema, Predicate, Result, Schema, SchemaRepresentation, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { strict as assert } from "node:assert"
import { randomUUID } from "node:crypto"
import { dirname, join, relative, sep } from "node:path"
import { defineSteps } from "sdp/steps"
import { assertRows, newWorld, output, produce, type Row, setFile, show, stdout, type Table, type World } from "./world.ts"
import { env, workspace } from "./process.ts"

/**
 * The plugin's one hook script, where the earlier implementation kept it (commit 0224fb7 of
 * software-delivery-protocol): plain JavaScript, which an installed package runs as it is.
 */
const hookScript = "hooks/session-start.mjs"

const hookOf = (world: World): NonNullable<World["pluginHook"]> =>
  world.pluginHook ??= { sessions: randomUUID(), shown: undefined, elapsedMs: undefined }

/** What a harness writes to a command hook's standard input, as Claude Code defines it and the others copy it. */
const hookInput = (event: string, session: string, cwd: string) => ({
  session_id: session,
  cwd,
  hook_event_name: event,
  ...(event === "SessionStart" ? { source: "startup" } : {}),
  ...(event === "UserPromptSubmit" ? { prompt: "Where does the project stand?" } : {}),
  ...(event === "PreToolUse" ? { tool_name: "Bash", tool_input: { command: "ls" } } : {})
})

/**
 * What a harness adds to the agent's context from what a command hook that exited 0 printed: a JSON
 * object's `hookSpecificOutput.additionalContext`, or nothing when it has none; anything else as it
 * is, as Claude Code adds it at session start. Whether each harness does so on each event is the
 * open question of install-the-agent-plugin about a model of each harness.
 */
const shownToTheAgent = (printed: string): string => {
  const answer: unknown = (() => {
    try {
      return JSON.parse(printed)
    } catch {
      return undefined
    }
  })()
  if (!Predicate.isObject(answer) || Array.isArray(answer)) return printed
  const specific = Predicate.hasProperty(answer, "hookSpecificOutput") ? answer.hookSpecificOutput : undefined
  const context = Predicate.hasProperty(specific, "additionalContext") ? specific.additionalContext : undefined
  return typeof context === "string" ? context : ""
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Effect.map(Stream.runCollect(stream), (chunks) => Buffer.concat(chunks).toString("utf8"))

/**
 * Runs the plugin's hook script as a harness does: in the directory the session started in, with
 * the event on standard input. Its temporary directory is the scenario's own. Stopping the step
 * stops the hook.
 */
const runHook = Effect.fn("runHook")(function*(world: World, plugin: string, at: string, event: string, session: string) {
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const script = join(plugin, hookScript)
  assert.ok(yield* fs.exists(script), `the plugin has no hook: no ${hookScript} in the repository`)
  const directory = yield* Effect.promise(() => workspace(world))
  const cwd = join(directory, at)
  const temporary = `${directory}.tmp`
  yield* fs.makeDirectory(cwd, { recursive: true })
  yield* fs.makeDirectory(temporary, { recursive: true })
  const run = Effect.scoped(Effect.gen(function*() {
    const handle = yield* spawner.spawn(ChildProcess.make(process.execPath, [script], {
      cwd,
      env: { ...env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
      extendEnv: false,
      stdin: Stream.make(new TextEncoder().encode(JSON.stringify(hookInput(event, session, cwd))))
    }))
    const [out, err, code] = yield* Effect.all([text(handle.stdout), text(handle.stderr), handle.exitCode], { concurrency: 3 })
    return { code: Number(code), stdout: out, stderr: err }
  }))
  const [elapsed, result] = yield* Effect.timed(run)
  const hook = hookOf(world)
  hook.elapsedMs = Duration.toMillis(elapsed)
  hook.shown = result.code === 0 ? shownToTheAgent(result.stdout) : ""
  produce(world, result.code === 0 ? hook.shown : result.stderr, {
    line: `the plugin's hook on ${event} in ${at}`,
    code: result.code,
    stdout: hook.shown
  })
}, Effect.provide(NodeServices.layer))

/** Text without its last line break, the one that ends its last line. */
const withoutFinalBreak = (text: string) => text.endsWith("\n") ? text.slice(0, -1) : text

/** Lines as a reader counts them: none in empty output, and a last line break ends a line, not starts one. */
const lineCount = (text: string) => {
  const body = withoutFinalBreak(text)
  return body === "" ? 0 : body.split("\n").length
}

/** Every file under a directory, at any depth; none when there is no such directory. */
const filesUnder = Effect.fn("filesUnder")(function*(directory: string) {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* fs.readDirectory(directory, { recursive: true }).pipe(Effect.orElseSucceed(() => []))
  const files: Array<string> = []
  for (const path of paths) {
    const info = yield* fs.stat(join(directory, path))
    if (info.type === "File") files.push(join(directory, path))
  }
  return files
})

/** A file's text, or undefined when there is none to read. */
const textOf = Effect.fn("textOf")(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => undefined))
})

/**
 * Each feature planned into the iteration, in the specs of the workspace at `root`, with a rule and
 * an open question: work an orientation must show, cut to its bound.
 */
const plannedFeatures = (world: World, count: number, iteration: string, root: string) => {
  for (let i = 1; i <= count; i++) {
    setFile(
      world,
      `${root}/specs/planned-${i}.feature`,
      `@id=planned-${i} @maturity=draft @iteration:${iteration}\nFeature: Planned ${i}\n\n` +
        `  Rule: Planned ${i} keeps what it was given\n\n  @open\n  Rule: Does planned ${i} need more?\n`
    )
  }
}

/**
 * The Agent Plugins manifest schemas, each as published (Apache License 2.0), so that no example
 * reaches the network for one: 1.0.0 from
 * https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/schemas/1.0.0/plugin.schema.json
 */
const agentPluginsSchemas: Readonly<Record<string, JsonSchema.JsonSchema>> = {
  "1.0.0": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    "title": "Agent Plugins Manifest",
    "description": "Machine-readable schema for plugin.json in Agent Plugins 1.0.0. The Agent Plugins specification defines additional semantic and operational requirements.",
    "type": "object",
    "properties": {
      "$schema": {
        "const": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        "description": "Canonical identifier of the plugin manifest schema for the Agent Plugins version targeted by this document."
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 64,
        "pattern": "^(?!.*(?:--|\\.\\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$",
        "description": "Human-readable plugin name."
      },
      "version": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "author": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "email": {
            "type": "string"
          },
          "url": {
            "type": "string"
          }
        },
        "additionalProperties": false
      },
      "homepage": {
        "type": "string"
      },
      "repository": {
        "type": "string"
      },
      "license": {
        "type": "string"
      },
      "keywords": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "extensions": {
        "type": "object",
        "description": "Client-specific manifest data keyed by reverse-domain extension namespace. Agent Plugins assigns no semantics to namespace object contents.",
        "additionalProperties": {
          "type": "object"
        }
      }
    },
    "required": ["$schema", "name"],
    "additionalProperties": false
  }
}

/**
 * The JSON Lines on stdout whose `type` is the one named, a row each. A column is a field of the
 * record or of its attrs; one a record lacks reads as empty.
 */
const assertRecords = (world: World, type: string, table: Table | undefined, mode: "exactly" | "including" = "exactly") => {
  const records = stdout(world).split("\n").filter((line) => line.trim() !== "").map((line, index): unknown => {
    try {
      return JSON.parse(line)
    } catch {
      return assert.fail(`line ${index + 1} of the output is not JSON: ${line}`)
    }
  })
  const rows = records
    .filter((record) => Predicate.hasProperty(record, "type") && record.type === type)
    .map((record): Row => {
      const { attrs, ...fields } = record as Record<string, unknown>
      const all = { ...(Predicate.isObject(attrs) ? attrs : {}), ...fields }
      return Object.fromEntries(Object.entries(all).map(([key, value]) => [key, show(value)]))
    })
  assertRows(`records of type ${type}`, rows, table, mode)
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // A new session each time: its id is one no other run has used.
  When("the plugin's hook runs at session start in {string}", ({ args: [at], project, world }) =>
    runHook(world, project.root, at, "SessionStart", randomUUID()))

  // The event as the harness names it; a session id stands for the same session only within the scenario.
  When("the plugin's hook runs on {string} for session {string} in {string}", ({ args: [event, session, at], project, world }) =>
    runHook(world, project.root, at, event, `${hookOf(world).sessions}-${session}`))

  // What the last command printed on stdout is what the last hook run showed the agent, each without its last line break.
  Then("the output is what the hook showed", ({ world }) => {
    const shown = hookOf(world).shown
    assert.ok(shown !== undefined, "the plugin's hook has not run")
    assert.equal(withoutFinalBreak(stdout(world)), withoutFinalBreak(shown), "the output is not what the hook showed")
  })

  Then("the hook answered within {int} ms", ({ args: [limit], world }) => {
    const elapsed = hookOf(world).elapsedMs
    assert.ok(elapsed !== undefined, "the plugin's hook has not run")
    assert.ok(elapsed <= limit, `the hook answered in ${Math.round(elapsed)} ms`)
  })

  Then("the output is empty", ({ world }) => {
    assert.equal(output(world), "", "the output is not empty")
  })

  Then("the output has {int} line(s)", ({ args: [count], world }) => {
    assert.equal(lineCount(output(world)), count, `lines of the output:\n${output(world)}`)
  })

  Then("the output has at most {int} line(s)", ({ args: [limit], world }) => {
    const count = lineCount(output(world))
    assert.ok(count <= limit, `the output has ${count} lines, more than ${limit}:\n${output(world)}`)
  })

  Given("{int} features in {string} planned into {string}, each with an open question", ({ args: [count, root, iteration], world }) =>
    plannedFeatures(world, count, iteration, root))

  Then("the records of type {string} are:", ({ args: [type], table, world }) => assertRecords(world, type, table))

  Then("the records of type {string} include at least:", ({ args: [type], table, world }) => assertRecords(world, type, table, "including"))

  // Named as a link from the naming file would name it: its path from that file's directory.
  Then("every file under {string} in the repository is named in {string}", ({ args: [directory, file], project }) =>
    Effect.gen(function*() {
      const files = yield* filesUnder(join(project.root, directory))
      assert.ok(files.length > 0, `no file under ${directory}`)
      const naming = yield* textOf(join(project.root, file))
      assert.ok(naming !== undefined, `no ${file} in the repository`)
      const from = dirname(join(project.root, file))
      const unnamed = files.map((path) => relative(from, path).split(sep).join("/")).filter((path) => !naming.includes(path))
      assert.deepEqual(unnamed, [], `${file} does not name every file under ${directory}`)
    }).pipe(Effect.provide(NodeServices.layer)))

  Then("{string} in the repository conforms to the Agent Plugins {word} schema", ({ args: [file, version], project }) =>
    Effect.gen(function*() {
      const document = agentPluginsSchemas[version]
      assert.ok(document, `no Agent Plugins ${version} schema is kept here; these are: ${Object.keys(agentPluginsSchemas).join(", ")}`)
      const text = yield* textOf(join(project.root, file))
      assert.ok(text !== undefined, `no ${file} in the repository`)
      const manifest: unknown = (() => {
        try {
          return JSON.parse(text)
        } catch (error) {
          return assert.fail(`${file} is not JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
      // A schema imported from JSON Schema decodes plain JSON and needs no services, which its type cannot say.
      const schema = SchemaRepresentation.fromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12(document), { patterns: "apply" }) as Schema.Decoder<unknown>
      const conforms = Schema.decodeUnknownResult(schema)(manifest, { onExcessProperty: "error", errors: "all" })
      if (Result.isFailure(conforms)) assert.fail(`${file} does not conform to the Agent Plugins ${version} schema:\n${String(conforms.failure)}`)
    }).pipe(Effect.provide(NodeServices.layer)))
})
