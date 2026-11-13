/**
 * Authoring: the use cases that write files — `sdp init` and `sdp new`. Each
 * says what it wrote, and neither rewrites a file that exists.
 *
 * @sdp is ARCH-application
 */
import { DateTime, Effect, FileSystem, Path, Result } from "effect"
import { readFile } from "node:fs/promises"
import { defaults } from "../model/Config.ts"
import { formatSource } from "../model/Graph.ts"
import { idForm, isId, isValueWord, made } from "../model/Vocabulary.ts"
import { Revisions } from "../workspace/Revisions.ts"
import { findFiles, loadProject } from "../workspace/Workspace.ts"
import { Refused } from "./Errors.ts"
import { configTemplate, newSpec } from "./Templates.ts"

/** The skill that teaches an agent to work with sdp, where agents look for skills. sdp ships the one it is developed with. */
const skillFile = ".claude/skills/sdp/SKILL.md"

/** sdp's own copy of the skill, from where this sdp is installed: a file of sdp's, not of the workspace, so not read through its FileSystem. */
const ownSkill = Effect.promise(() => readFile(new URL(`../../${skillFile}`, import.meta.url), "utf8"))

/**
 * Writes a file that does not exist yet, and says whether it did: creating it is the check, so a
 * file another process made in the meantime is never overwritten.
 */
const createFile = Effect.fnUntraced(function*(file: string, content: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.writeFileString(file, content, { flag: "wx" }).pipe(
    Effect.as(true),
    Effect.catchIf((error) => error.reason._tag === "AlreadyExists", () => Effect.succeed(false))
  )
})

/**
 * Whether a .gitignore has a line that names a directory, as `.sdp`, `/.sdp/` or `.sdp/**`: what
 * is known of it where git cannot say whether it ignores one.
 */
const namesDirectory = (gitignore: string, directory: string) =>
  gitignore.split("\n").some((line) => line.trim().replace(/^\//, "").replace(/\/(\*\*?)?$/, "") === directory)

/**
 * `sdp init`: a configuration and the skill, and a .gitignore of the directory `sdp run` records in
 * where git does not ignore it already, for a result holds only in the checkout where it ran. Files
 * that exist are left alone, and `next` says what to add to a .gitignore that does not ignore it.
 */
export const init = Effect.fn("init")(function*(root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const skill = yield* ownSkill
  const files = [["sdp.config.yaml", configTemplate], [skillFile, skill]] as const
  const written: Array<{ readonly file: string; readonly created: boolean; readonly next?: string }> = []
  for (const [file, content] of files) {
    const target = path.join(root, file)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true })
    written.push({ file, created: yield* createFile(target, content) })
  }
  const records = path.dirname(defaults.results)
  const ignored = yield* (yield* Revisions).ignores(root, defaults.results)
  if (ignored !== true) {
    const file = ".gitignore"
    const target = path.join(root, file)
    const created = yield* createFile(target, `${records}/\n`)
    const named = ignored === undefined && !created && namesDirectory(yield* fs.readFileString(target), records)
    written.push({
      file,
      created,
      ...(created || named ? {} : { next: `add ${records}/ to ${file}: what sdp run records holds only in the checkout where it ran` })
    })
  }
  return written
})

export interface CreateInput {
  readonly kind: string
  readonly title: string
  /** Use this id instead of one made from the title. */
  readonly id?: string | undefined
  /** How far it has come, in the team's judgement: a rung of the configured ladder (default: its lowest). */
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
    : input.id?.includes("#")
    ? `the id ${JSON.stringify(input.id)} holds #, which names a rule or an example of a spec: write a rule as a \`Rule:\` in its spec's file, and an id without #`
    : input.id !== undefined && !isId(input.id)
    ? `the id ${JSON.stringify(input.id)} would not read back from a tag: an id is ${idForm}`
    : input.dir !== undefined && input.dir.trim() === ""
    ? "--dir needs a directory, relative to the workspace root or absolute"
    : input.maturity !== undefined && !isValueWord(input.maturity)
    ? `${JSON.stringify(input.maturity)}: a maturity is one word: write it without a space, @, = or :`
    : undefined

/**
 * `sdp new`: a spec from a template, or for an element only its id, since its code declares it.
 * Refuses input it cannot make a file of, a change, which is rules of a feature, a kind named like
 * a maturity, an id or a file that exists, and a spec that would not read back.
 */
export const create = Effect.fn("create")(function*(root: string, input: CreateInput) {
  const reason = unusable(input)
  if (reason !== undefined) return yield* new Refused({ reason })
  const project = yield* loadProject(root, { withResults: false })
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
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
  if (created.file === undefined) return { id: created.id, file: undefined, next: created.next, unread: undefined }
  const target = path.resolve(root, created.file.path)
  yield* fs.makeDirectory(path.dirname(target), { recursive: true })
  // Compared as real paths: an absolute directory may reach the workspace through a symbolic link.
  const relative = path.relative(yield* fs.realPath(root), path.join(yield* fs.realPath(path.dirname(target)), path.basename(target)))
  const inside = !relative.startsWith("..") && !path.isAbsolute(relative)
  const file = inside ? relative : target
  if (!(yield* createFile(target, created.file.content))) return yield* new Refused({ reason: `${file} already exists` })
  // Found again the way every command finds specs: what the features globs do not match is in no graph.
  const { exclude, features } = project.config
  const unread = !inside
    ? `${file} is outside the workspace ${root}, so it is not part of its graph`
    : !(yield* findFiles(root, features, exclude)).includes(file)
    ? `${file} is matched by no features glob (${features.join(", ")}), so it is not part of the graph: write it where they look with --dir, or add its directory to features`
    : undefined
  /** `next` is what to write in it; `unread` why no command will read it, when none will. */
  return { id: created.id, file, next: created.next, unread }
})
