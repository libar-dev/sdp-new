/**
 * Authoring: the use cases that write files — `sdp init`, `sdp new` and
 * `sdp types`. Each says what it wrote; none overwrites what is there.
 */
import { annotate } from "sdp/annotations"
import { DateTime, Effect, FileSystem, Path, Result } from "effect"
import { fileURLToPath } from "node:url"
import { idsDeclaration } from "../graph/Types.ts"
import { formatSource } from "../model/Graph.ts"
import { made } from "../model/Vocabulary.ts"
import { loadProject } from "../workspace/Workspace.ts"
import { Refused } from "./Errors.ts"
import { configTemplate, newSpec } from "./Templates.ts"

annotate(import.meta, { is: "ARCH-reports" })

/** The skill that teaches an agent to work with sdp, where agents look for skills. sdp ships the one it is developed with. */
const skillFile = ".claude/skills/sdp/SKILL.md"

/** `sdp init`: a configuration and the skill; files that exist are left alone. */
export const init = Effect.fn("init")(function*(root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const skill = yield* fs.readFileString(fileURLToPath(new URL(`../../${skillFile}`, import.meta.url)))
  const files = [["sdp.config.yaml", configTemplate], [skillFile, skill]] as const
  const written: Array<{ readonly file: string; readonly created: boolean }> = []
  for (const [file, content] of files) {
    const target = path.join(root, file)
    const exists = yield* fs.exists(target)
    if (!exists) {
      yield* fs.makeDirectory(path.dirname(target), { recursive: true })
      yield* fs.writeFileString(target, content)
    }
    written.push({ file, created: !exists })
  }
  return written
})

export interface CreateInput {
  readonly kind: string
  readonly title: string
  /** Use this id instead of one made from the title. */
  readonly id?: string | undefined
  /** A level of the configured ladder (default: the lowest). */
  readonly maturity?: string | undefined
  /** Directory to write to, relative to the workspace root or absolute (default: by kind). */
  readonly dir?: string | undefined
}

/** Why `sdp new` cannot make a file out of this input, or `undefined` when it can. */
const unusable = (input: CreateInput): string | undefined =>
  !/^[\p{L}][\p{L}\p{N}_-]*$/u.test(input.kind)
    ? `${JSON.stringify(input.kind)} is not a kind: a kind is one word — letters, digits, - and _ — such as requirement or bounded-context`
    : input.title.trim() === ""
    ? `a ${input.kind} needs a title: sdp new ${input.kind} "<title>"`
    : input.id !== undefined && /[\\/]/.test(input.id)
    ? `the id ${JSON.stringify(input.id)} cannot name a file: write it without a slash, and choose the directory with --dir`
    : input.dir !== undefined && input.dir.trim() === ""
    ? "--dir needs a directory, relative to the workspace root or absolute"
    : undefined

/** `sdp new`: a spec from a template. Refuses input it cannot make a file of, an id or a file that exists, and a spec that would not read back. */
export const create = Effect.fn("create")(function*(root: string, input: CreateInput) {
  const reason = unusable(input)
  if (reason !== undefined) return yield* new Refused({ reason })
  const project = yield* loadProject(root, { withResults: false })
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const ladder = project.config.vocabulary.maturity
  if (input.maturity !== undefined && !ladder.includes(input.maturity)) {
    return yield* new Refused({ reason: `unknown maturity ${input.maturity}: use one of ${ladder.join(", ")}` })
  }
  const drafted = newSpec({
    ...input,
    today: DateTime.formatIsoDate(yield* DateTime.now),
    config: project.config,
    graph: project.graph
  })
  if (Result.isFailure(drafted)) return yield* new Refused({ reason: drafted.failure })
  const created = drafted.success
  // An id only a dangling link names is waiting for exactly this node.
  const existing = project.graph.node(created.id)
  if (existing && existing.kind !== made.kinds.missing) {
    return yield* new Refused({ reason: `id ${created.id} already exists at ${formatSource(existing.source)}` })
  }
  const target = path.resolve(root, created.file)
  yield* fs.makeDirectory(path.dirname(target), { recursive: true })
  // Compared as real paths: an absolute directory may reach the workspace through a symbolic link.
  const relative = path.relative(yield* fs.realPath(root), path.join(yield* fs.realPath(path.dirname(target)), path.basename(target)))
  const inside = !relative.startsWith("..") && !path.isAbsolute(relative)
  const file = inside ? relative : target
  if (yield* fs.exists(target)) return yield* new Refused({ reason: `${file} already exists` })
  yield* fs.writeFileString(target, created.content)
  /** `inside` is false for a file outside the workspace, which is therefore not part of its graph; `next` is what to write in it. */
  return { id: created.id, file, inside, next: created.next }
})

/** `sdp types`: the id declarations that type `annotate()`, written to the configured path. */
export const types = Effect.fn("types")(function*(root: string) {
  const project = yield* loadProject(root, { withResults: false })
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(root, project.config.types)
  const declaration = idsDeclaration(project)
  yield* fs.makeDirectory(path.dirname(file), { recursive: true })
  yield* fs.writeFileString(file, declaration)
  return { file: project.config.types, ids: declaration.split("\n").filter((line) => line.startsWith("    \"")).length }
})
