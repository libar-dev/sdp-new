/**
 * The package npm packs from this repository, and a project that installs it. What is packed is a
 * checkout of this repository: a copy of its working tree, the files git tracks or does not ignore,
 * with this repository's node_modules, packed once per process, so that packing writes nothing that
 * other scenarios read. A project installs the package as npm would, with no network: the tarball
 * unpacked into its node_modules under the name it is installed as, each package it and the
 * project's package.json depend on linked from this repository's node_modules, and each command
 * the package declares linked into node_modules/.bin.
 */
import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import { rmSync } from "node:fs"
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative } from "node:path"
import { Effect } from "effect"
import { defineSteps } from "sdp/steps"
import { directoryOf, env, type Ran, repository, spawned } from "./process.ts"
import { ids, newWorld, stdout } from "./world.ts"

interface Packed extends Ran {
  /** The tarball npm wrote, when it wrote one. */
  readonly tarball: string | undefined
  /** The files of the checkout, each with a digest of its content, before and after it was packed. */
  readonly before: ReadonlyMap<string, string>
  readonly after: ReadonlyMap<string, string>
}

/** A command and every process it starts, as one group that ends when the step waiting on it is stopped. */
const run = (command: string, args: ReadonlyArray<string>, cwd: string, signal: AbortSignal, environment: Readonly<Record<string, string | undefined>> = env): Promise<Ran> =>
  Effect.runPromise(spawned(command, args, { cwd, env: environment }), { signal })

/** npm as a developer runs it: none of the settings an `npm run` that started this process hands down, and no network. */
const npmEnv: Readonly<Record<string, string | undefined>> = {
  ...Object.fromEntries(Object.entries(env).filter(([key]) => !/^npm_/i.test(key) && key !== "INIT_CWD")),
  npm_config_offline: "true",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false"
}

/** Every file under `root` but its node_modules, by its path relative to `root`, with a digest of its content. */
const snapshot = async (root: string): Promise<ReadonlyMap<string, string>> => {
  const files = new Map<string, string>()
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (directory === root && entry.name === "node_modules") continue
      if (entry.isDirectory()) await walk(file)
      else files.set(relative(root, file), createHash("sha256").update(await readFile(file).catch(() => "")).digest("hex"))
    }
  }
  await walk(root)
  return files
}

const pack = async (signal: AbortSignal): Promise<Packed> => {
  const base = await mkdtemp(join(tmpdir(), "sdp-pack-"))
  process.once("exit", () => rmSync(base, { recursive: true, force: true }))
  const checkout = join(base, "checkout")
  const destination = join(base, "packed")
  await mkdir(destination, { recursive: true })
  const listed = await run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], repository, signal)
  assert.equal(listed.code, 0, `git ls-files failed: ${listed.stderr}`)
  for (const file of new Set(listed.stdout.split("\0").filter((file) => file !== ""))) {
    // A file git tracks that the working tree deleted is not in the checkout.
    if (!(await lstat(join(repository, file)).then(() => true, () => false))) continue
    await mkdir(dirname(join(checkout, file)), { recursive: true })
    await cp(join(repository, file), join(checkout, file), { verbatimSymlinks: true })
  }
  await symlink(await realpath(join(repository, "node_modules")), join(checkout, "node_modules"))
  const before = await snapshot(checkout)
  const packed = await run("npm", ["pack", "--pack-destination", destination], checkout, signal, npmEnv)
  const after = await snapshot(checkout)
  const tarball = (await readdir(destination)).find((file) => file.endsWith(".tgz"))
  return { ...packed, tarball: tarball && join(destination, tarball), before, after }
}

/**
 * Packed once per process, by the step that needs it first. A pack that fails, or whose step is
 * stopped, is forgotten at once — not once its processes have ended — so the next step packs again.
 */
let packing: Promise<Packed> | undefined
const packed = (signal: AbortSignal): Promise<Packed> => {
  if (packing !== undefined) return packing
  const attempt = pack(signal)
  const forget = () => {
    if (packing === attempt) packing = undefined
  }
  signal.addEventListener("abort", forget, { once: true })
  attempt.then(() => signal.removeEventListener("abort", forget), forget)
  packing = attempt
  return attempt
}

const readJson = async (file: string): Promise<Record<string, any>> => JSON.parse(await readFile(file, "utf8"))

/** Links `node_modules/<name>` of `project` to the package of that name installed in this repository. */
const linkInstalled = async (project: string, name: string) => {
  const link = join(project, "node_modules", name)
  if (await lstat(link).then(() => true, () => false)) return
  const installed = await realpath(join(repository, "node_modules", name)).catch(() => undefined)
  assert.ok(installed, `${name} is not installed in this repository, so a project cannot install it with no network`)
  await mkdir(dirname(link), { recursive: true })
  await symlink(installed, link)
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // under that name is the one npm packs, and every other one is linked from this repository.
  Given("the package npm packs from a checkout of this repository, installed in the workspace as {string}", async ({ args: [name], signal, world }) => {
    const result = await packed(signal)
    assert.ok(result.code === 0 && result.tarball, `npm pack exited with ${result.code}:\n${result.stdout}${result.stderr}`)
    const project = await directoryOf(world)
    const installed = join(project, "node_modules", name)
    await mkdir(installed, { recursive: true })
    const unpacked = await run("tar", ["-xzf", result.tarball, "-C", installed, "--strip-components=1"], project, signal)
    assert.equal(unpacked.code, 0, `tar could not unpack ${basename(result.tarball)}: ${unpacked.stderr}`)
    const manifest = await readJson(join(installed, "package.json"))
    const own = world.files.get("package.json")
    const wanted: Record<string, string> = own === undefined ? {} : { ...JSON.parse(own).dependencies, ...JSON.parse(own).devDependencies }
    const spec = wanted[name]
    if (spec?.startsWith("npm:")) {
      const named = spec.slice("npm:".length).replace(/(?<=.)@[^@/]*$/, "")
      assert.equal(manifest.name, named, `package.json installs ${named} as ${name}, but the package npm packs is named ${manifest.name}`)
    }
    const dependencies = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(wanted).filter((dependency) => dependency !== name)]
    for (const dependency of dependencies) await linkInstalled(project, dependency)
    const bins: Record<string, string> = typeof manifest.bin === "string" ? { [basename(manifest.name)]: manifest.bin } : manifest.bin ?? {}
    for (const [command, file] of Object.entries(bins)) {
      const target = join(installed, file)
      await chmod(target, 0o755)
      await mkdir(join(project, "node_modules", ".bin"), { recursive: true })
      await symlink(relative(join(project, "node_modules", ".bin"), target), join(project, "node_modules", ".bin", command))
    }
  })

  // The JSON output is a package.json; each package is compared with the version installed in this repository.
  Then("the JSON output depends on exactly the versions of {string} this repository runs with", async ({ args: [names], world }) => {
    const manifest = JSON.parse(stdout(world)) as Record<string, any>
    const rows = async (version: (name: string) => Promise<string | undefined>) =>
      Promise.all(ids(names).map(async (name) => `${name} ${await version(name) ?? "(none)"}`))
    assert.deepEqual(
      await rows(async (name) => manifest.dependencies?.[name]),
      await rows(async (name) => (await readJson(join(repository, "node_modules", name, "package.json"))).version),
      "the versions it depends on, and those this repository runs with"
    )
  })
})
