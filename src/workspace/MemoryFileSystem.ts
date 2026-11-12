/**
 * An in-memory `FileSystem` for tests and executable specs: the real loading
 * pipeline runs against a map of `relative path → content` rooted at "/ws".
 */
import { Effect, FileSystem, Layer, Path } from "effect"
import { systemError } from "effect/PlatformError"
import { noRevisions, Revisions } from "./Revisions.ts"
import { loadProject } from "./Workspace.ts"

export const memoryRoot = "/ws"

export const makeMemoryFileSystem = (files: Map<string, string>): FileSystem.FileSystem => {
  const rel = (path: string) =>
    path === memoryRoot ? "" : path.startsWith(`${memoryRoot}/`) ? path.slice(memoryRoot.length + 1) : path.replace(/^\.(\/|$)/, "")
  const notFound = (method: string, path: string) =>
    systemError({ _tag: "NotFound", module: "FileSystem", method, pathOrDescriptor: path })
  return FileSystem.makeNoop({
    exists: (path) =>
      Effect.succeed(
        path === memoryRoot || files.has(rel(path)) || [...files.keys()].some((f) => f.startsWith(`${rel(path)}/`))
      ),
    readFileString: (path) => {
      const content = files.get(rel(path))
      return content === undefined ? Effect.fail(notFound("readFileString", path)) : Effect.succeed(content)
    },
    // The results store needs these three: create-if-absent (its lock), rename and remove.
    writeFileString: (path, data, options) =>
      options?.flag === "wx" && files.has(rel(path))
        ? Effect.fail(systemError({ _tag: "AlreadyExists", module: "FileSystem", method: "writeFileString", pathOrDescriptor: path }))
        : Effect.sync(() => void files.set(rel(path), data)),
    rename: (from, to) =>
      Effect.sync(() => {
        files.set(rel(to), files.get(rel(from)) ?? "")
        files.delete(rel(from))
      }),
    remove: (path) => Effect.sync(() => void files.delete(rel(path))),
    makeDirectory: () => Effect.void,
    // Globs walk directories as on disk: each lists its entries with their types.
    readDirectoryEntries: (path) => {
      const directory = rel(path)
      const prefix = directory === "" ? "" : `${directory}/`
      const entries = new Map<string, FileSystem.File.Type>()
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue
        const [name = "", ...below] = file.slice(prefix.length).split("/")
        entries.set(name, below.length > 0 ? "Directory" : "File")
      }
      return entries.size === 0 && path !== memoryRoot
        ? Effect.fail(notFound("readDirectoryEntries", path))
        : Effect.succeed([...entries].map(([name, type]) => ({ name, type })))
    },
    // Only the type: whether a path is a file or a directory is all sdp asks.
    stat: (path) =>
      files.has(rel(path))
        ? Effect.succeed({ type: "File" } as FileSystem.File.Info)
        : path === memoryRoot || [...files.keys()].some((f) => f.startsWith(`${rel(path)}/`))
        ? Effect.succeed({ type: "Directory" } as FileSystem.File.Info)
        : Effect.fail(notFound("stat", path))
  })
}

export const layerMemory = (files: Map<string, string>): Layer.Layer<FileSystem.FileSystem> =>
  Layer.succeed(FileSystem.FileSystem, makeMemoryFileSystem(files))

/** Everything the loading pipeline needs to run on an in-memory workspace, which is in no repository. */
export const layerMemoryWorkspace = (files: Map<string, string>): Layer.Layer<FileSystem.FileSystem | Path.Path> =>
  Layer.mergeAll(layerMemory(files), Path.layer, Layer.succeed(Revisions, noRevisions))

/** Load a project from in-memory files, optionally with stored results (as written to `config.results`). */
export const loadMemoryProject = (files: Map<string, string>, options: { readonly withResults?: boolean } = {}) =>
  loadProject(memoryRoot, options).pipe(Effect.provide(layerMemoryWorkspace(files)))
