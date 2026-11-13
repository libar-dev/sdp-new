#!/usr/bin/env node
/**
 * A workspace of any size on disk, for measuring sdp on it: features, decisions and source files
 * that link to one another the way a large repository's do.
 *
 *   node scripts/bench/generate.ts <directory> [--specs 5000] [--files 20000]    empties <directory> first
 *
 * Of the specs, one in a hundred is a decision and the rest are features, each in the folder of
 * its area, with three rules of one example each; one feature in ten is still to come, at
 * `ready`. Every feature is realized by an element, depends on another feature, and has a rule
 * decided by a decision. One source file in ten declares a part of one of the elements
 * (`@sdp is`), one in a hundred applies a pattern, and every file imports two others, so the
 * elements import one another through their code. The workspace waives the comparison with a git
 * base. The same counts give the same files, so two runs measure the same workspace.
 */
import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

export interface Size {
  readonly specs: number
  readonly files: number
}

/** What was written, by kind. */
export interface Generated {
  readonly features: number
  readonly decisions: number
  readonly elements: number
  readonly patterns: number
  readonly files: number
  readonly annotated: number
}

const areas = 50
const filesPerDirectory = 100

/** The counts the workspace is made of, from its size. */
export const layout = ({ files, specs }: Size) => {
  const decisions = Math.max(1, Math.floor(specs / 100))
  const annotated = Math.ceil(files / 10)
  return {
    decisions,
    features: Math.max(0, specs - decisions),
    elements: Math.max(1, Math.floor(annotated / 10)),
    patterns: Math.max(1, Math.floor(files / 1000)),
    files,
    annotated
  }
}

const feature = (i: number, counts: ReturnType<typeof layout>) => {
  const toCome = i % 10 === 0 ? " @maturity=ready" : ""
  return `@id=feature-${i}${toCome} @realized-by:ARCH-e${i % counts.elements}
@depends-on:feature-${(i * 7 + 1) % counts.features}
Feature: Feature ${i}

  The users of area ${i % areas} do thing ${i} in one step, where it took them three.

  Rule: Thing ${i} is done once

    Doing it again changes nothing, so a retry is safe.

    Scenario: Done twice
      Given a thing ${i}
      When it is done twice
      Then it is done once

  @decided-by:decision-${i % counts.decisions}
  Rule: Thing ${i} can be undone

    Scenario: Undone
      Given a thing ${i} that is done
      When it is undone
      Then it is not done

  Rule: Thing ${i} is listed with the others

    Scenario: Listed
      Given a thing ${i} and a thing ${i + 1}
      When the things are listed
      Then both are listed
`
}

const decision = (j: number) => `@id=decision-${j} @kind=decision
Feature: Option ${j} over the others

  Option ${j} was chosen over the others because it is simpler, at the cost of some flexibility.
`

const modulePath = (j: number, counts: ReturnType<typeof layout>) =>
  `src/m${j % Math.max(1, Math.ceil(counts.files / filesPerDirectory))}/file-${j}.ts`

/** A source file: two imports, an interface, a class and a few functions; every tenth one is part of an element. */
const source = (j: number, counts: ReturnType<typeof layout>) => {
  const from = dirname(modulePath(j, counts))
  const relativeTo = (k: number) => {
    const target = modulePath(k, counts)
    const directory = dirname(target)
    return directory === from ? `./${target.slice(directory.length + 1)}` : `../${target.slice("src/".length)}`
  }
  const a = (j + 10) % counts.files
  const b = (j * 31 + 7) % counts.files
  const tags = [
    ...(j % 10 === 0 ? [` * @sdp is ARCH-e${(j / 10) % counts.elements}`] : []),
    ...(j % 100 === 50 ? [` * @sdp applies PAT-p${(j / 100 | 0) % counts.patterns}`] : [])
  ]
  return `import { compute${a} } from "${relativeTo(a)}"
import { compute${b} } from "${relativeTo(b)}"

/** A shape module ${j} works with. */
export interface Shape${j} {
  readonly id: string
  readonly size: number
  readonly tags: ReadonlyArray<string>
}

/**
 * What module ${j} computes from two others.${tags.length > 0 ? `\n *\n${tags.join("\n")}` : ""}
 */
export const compute${j} = (input: number): number => input > ${j % 97} ? compute${a}(input - 1) + compute${b}(input - 2) : input

export class Store${j} {
  readonly #items = new Map<string, Shape${j}>()

  add(shape: Shape${j}): void {
    this.#items.set(shape.id, shape)
  }

  find(id: string): Shape${j} | undefined {
    return this.#items.get(id)
  }

  get size(): number {
    let total = 0
    for (const item of this.#items.values()) total += item.size
    return total
  }
}

export function describe${j}(shape: Shape${j}): string {
  const tags = shape.tags.length > 0 ? \` [\${shape.tags.join(", ")}]\` : ""
  return \`\${shape.id} (\${shape.size})\${tags}\`
}

export const largest${j} = (shapes: ReadonlyArray<Shape${j}>): Shape${j} | undefined =>
  shapes.reduce<Shape${j} | undefined>((best, shape) => best === undefined || shape.size > best.size ? shape : best, undefined)
`
}

/** The declaration of each pattern, in a file of their own: `@sdp is` on a declaration's doc comment. */
const declarations = (counts: ReturnType<typeof layout>) => {
  const lines = [
    ...Array.from({ length: counts.patterns }, (_, p) => `/**\n * Pattern ${p}: what its instances share.\n *\n * @sdp is PAT-p${p}\n */\nexport const pattern${p} = ${p}\n`)
  ]
  return lines.join("\n")
}

/** Writes the workspace into `directory`, beside whatever is there. */
export const generateWorkspace = async (directory: string, size: Size): Promise<Generated> => {
  const counts = layout(size)
  const files: Array<readonly [string, string]> = [
    ["sdp.config.yaml", "# Generated by scripts/bench/generate.ts: no git base to compare with.\nbase: none\n"],
    ["src/patterns.ts", declarations(counts)]
  ]
  for (let i = 0; i < counts.features; i++) files.push([`specs/features/area-${i % areas}/feature-${i}.feature`, feature(i, counts)])
  for (let j = 0; j < counts.decisions; j++) files.push([`specs/decisions/decision-${j}.feature`, decision(j)])
  for (let j = 0; j < counts.files; j++) files.push([modulePath(j, counts), source(j, counts)])
  const directories = new Set(files.map(([path]) => dirname(join(directory, path))))
  for (const created of directories) await mkdir(created, { recursive: true })
  for (let start = 0; start < files.length; start += 512) {
    await Promise.all(files.slice(start, start + 512).map(([path, content]) => writeFile(join(directory, path), content)))
  }
  return {
    features: counts.features,
    decisions: counts.decisions,
    elements: counts.elements,
    patterns: counts.patterns,
    files: counts.files + 1,
    annotated: counts.annotated
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { specs: { type: "string", default: "5000" }, files: { type: "string", default: "20000" } }
  })
  const [directory] = positionals
  if (directory === undefined) {
    console.error("usage: node scripts/bench/generate.ts <directory> [--specs 5000] [--files 20000]")
    process.exit(1)
  }
  const started = performance.now()
  await rm(resolve(directory), { recursive: true, force: true })
  const generated = await generateWorkspace(resolve(directory), { specs: Number(values.specs), files: Number(values.files) })
  console.log(JSON.stringify({ directory: resolve(directory), ...generated, ms: Math.round(performance.now() - started) }))
}
