#!/usr/bin/env node
/**
 * Orientation: what an agent, or a person, fetches first on a repository specified with sdp.
 *
 *   node scripts/orient/orient.ts                     every recipe, as text
 *   node scripts/orient/orient.ts --only to-come,open  some, by name or number
 *   node scripts/orient/orient.ts --json | jq …       every row as a JSON line: { section, rec, … }
 *   node scripts/orient/orient.ts --sizes             each section's size in characters, on stderr
 *   node scripts/orient/orient.ts my-recipe.ts        a recipe of your own, after the shipped ones
 *   node scripts/orient/orient.ts --root ../shop      another workspace
 *
 * A recipe is a file in recipes/, named `NN-name.ts`, whose default export is a `Recipe` (lib.ts):
 * the sdp surfaces it asks for and a function from them to rows. The runner asks sdp for each
 * surface once, whatever number of recipes read it, runs every recipe and prints its rows.
 */
import { readdirSync, readFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { parseArgs } from "node:util"
import { type Graph, indexGraph, type Lifecycle, type Recipe, type Row, type State, type Vocabulary } from "./lib.ts"
import { ask, command, type Edge, type Node, type Surface } from "./sdp.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
    json: { type: "boolean", default: false },
    sizes: { type: "boolean", default: false },
    root: { type: "string", default: "." }
  }
})
const root = resolve(values.root)

const recipesDir = new URL("./recipes/", import.meta.url)
const shipped = readdirSync(recipesDir).filter((f) => /^\d+-.+\.ts$/.test(f)).sort()
const files = [...shipped.map((f) => new URL(f, recipesDir).href), ...positionals.map((p) => new URL(`file://${resolve(p)}`).href)]
const loaded = await Promise.all(
  files.map(async (href) => {
    const name = basename(new URL(href).pathname, ".ts").replace(/^\d+-/, "")
    const number = /\/(\d+)-[^/]+$/.exec(href)?.[1]
    return { name, number, own: number === undefined, recipe: ((await import(href)) as { default: Recipe }).default }
  })
)
const wanted = values.only?.split(",").map((s) => s.trim())
// A recipe named on the command line always runs; --only chooses among the shipped ones.
const chosen = loaded.filter((r) => r.own || wanted === undefined || wanted.includes(r.name) || (r.number !== undefined && wanted.includes(String(Number(r.number)))))

// Each surface once, all at once.
const needed = [...new Set(chosen.flatMap((r) => r.recipe.asks))]
const answers = new Map(await Promise.all(needed.map(async (s) => [s, await ask(s, root)] as const)))
const value = <A>(s: Surface): A => answers.get(s)?.value as A
const state: State = {
  root,
  json: values.json,
  graph: answers.has("graph") ? indexGraph(value<ReadonlyArray<Node | Edge>>("graph")) : (undefined as unknown as Graph),
  vocabulary: value<Vocabulary>("vocabulary"),
  lifecycle: value<Lifecycle>("lifecycle"),
  read: (file) => readFileSync(resolve(root, file), "utf8")
}

/**
 * Text: one row a line, its cells apart by a tab, `-` for a cell with no value and none after the
 * last that has one. A tab keeps a cell's spaces its own (`cut -f3`, `awk -F'\t'`); a person who
 * wants the columns aligned pipes it through `column -ts$'\t'`.
 */
const text = (rows: ReadonlyArray<Row>): Array<string> =>
  rows.map((row) => {
    const cells = Object.values(row).map((c) => (c === undefined ? "-" : String(c)))
    while (cells.at(-1) === "-") cells.pop()
    return cells.join("\t")
  })

const out: Array<string> = []
const sizes: Array<[string, number]> = []
const notes = [...answers].flatMap(([s, a]) => a.notes.map((n) => `${command(s)}: ${n}`))
if (notes.length > 0) out.push(...(values.json ? notes.map((note) => JSON.stringify({ section: "notes", rec: "note", note })) : notes.map((n) => `! ${n}`)))

for (const { name, number, recipe } of chosen) {
  const sources = [...recipe.asks.map(command), ...(recipe.reads?.(state) ?? [])]
  const rows = recipe.rows(state)
  const lines = values.json
    ? [
      JSON.stringify({ section: name, rec: "section", title: recipe.title, asks: sources, legend: recipe.legend }),
      ...rows.map((row) => JSON.stringify({ section: name, ...row }))
    ]
    : [
      `## ${number === undefined ? "" : `${Number(number)} `}${name} — ${recipe.title}  ← ${sources.join(" · ")}`,
      ...(recipe.legend === undefined ? [] : [`#  ${recipe.legend}`]),
      ...text(rows)
    ]
  const section = lines.join("\n")
  sizes.push([name, section.length])
  out.push(section, ...(values.json ? [] : [""]))
}

const printed = out.join("\n")
process.stdout.write(printed.endsWith("\n") ? printed : `${printed}\n`)
if (values.sizes) {
  for (const [name, n] of sizes) process.stderr.write(`${String(n).padStart(6)}  ${name}\n`)
  process.stderr.write(`${String(printed.length).padStart(6)}  total\n`)
}
