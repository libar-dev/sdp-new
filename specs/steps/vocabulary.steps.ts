/**
 * The words this repository's specs and code use, and those of the example workspace adopters copy,
 * class by class, held against a table that lists each word with what sdp does with it and what it
 * means. A word used and not listed fails, and so does a word listed and no longer used, so the list
 * can grow only where a reviewer sees it grow.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { join } from "node:path"
import type { Project } from "../../src/graph/Build.ts"
import { isLinkKey, made } from "../../src/model/Vocabulary.ts"
import { loadProject } from "../../src/workspace/Workspace.ts"
import { defineSteps } from "sdp/steps"
import { assertRows, newWorld, show, stdout, type Table, type World } from "./world.ts"

/** What sdp does with a word: makes it itself, reads a meaning into it, or keeps it as written and reads none. */
type Sdp = "makes" | "interprets" | "carries"

type Words = ReadonlyMap<string, Sdp>

/**
 * The keys a spec's tag line has whatever its vocabulary: the id and kind a Feature declares, and
 * the maturity of work still to come. The format names them, not the vocabulary profile.
 */
const formatKeys: ReadonlyArray<string> = ["id", "kind", "maturity"]

const collect = (words: Iterable<string>, sdp: (word: string) => Sdp): Words =>
  new Map([...new Set(words)].map((word) => [word, sdp(word)]))

/** The kinds of the nodes in the graph. */
const kinds = (project: Project): Words => {
  const vocabulary = project.config.vocabulary
  const interpreted = new Set([...Object.values(vocabulary.kinds).flat(), ...Object.values(vocabulary.disciplines).flat()])
  const makes = new Set<string>(Object.values(made.kinds))
  return collect(project.graph.nodes().map((n) => n.kind), (kind) =>
    makes.has(kind) ? "makes" : interpreted.has(kind) ? "interprets" : "carries")
}

/** The relations of the edges in the graph, whether a spec, the code or sdp wrote them. */
const relations = (project: Project): Words => {
  const vocabulary = project.config.vocabulary
  const { plan, phase, closes, replaces, anchor, scenario } = vocabulary.relations
  const interpreted = new Set([...plan, ...phase, ...closes, ...replaces, anchor])
  const makes = new Set<string>([...Object.values(made.relations), scenario])
  return collect(project.graph.edges().map((e) => e.rel), (rel) =>
    makes.has(rel) ? "makes" : interpreted.has(rel) || isLinkKey(vocabulary, rel) ? "interprets" : "carries")
}

/** The top key of a fact, `owner` for `@owner.team=core`. */
const topKey = (key: string) => key.split(".")[0]!

const interpretedFacts = (project: Project) =>
  new Set([...formatKeys, ...Object.values(project.config.vocabulary.attributes)])

/** The keys of the facts written on a Feature, a Rule or a Scenario, `@key=value`. */
const facts = (project: Project): Words => {
  const interpreted = interpretedFacts(project)
  const written = project.specs.flatMap((spec) => [spec, ...spec.rules, ...spec.scenarios].flatMap((tagged) => Object.keys(tagged.attrLines)))
  return collect(written.map(topKey), (key) => interpreted.has(key) ? "interprets" : "carries")
}

/** The keys of the facts an `@sdp` annotation in code writes after its ids, `key=value`. */
const annotationFacts = (project: Project): Words => {
  const interpreted = interpretedFacts(project)
  return collect(project.annotations.flatMap((a) => Object.keys(a.attrs)).map(topKey), (key) => interpreted.has(key) ? "interprets" : "carries")
}

/**
 * The Cucumber tags written on a Feature, a Rule, a Scenario or its Examples, each with its `@`.
 * An example also inherits its spec's kind as a tag, `@feature`, which sdp adds and nobody writes.
 */
const tags = (project: Project): Words => {
  const interpreted = new Set<string>(Object.values(made.tags))
  const written = project.specs.flatMap((spec) => {
    const above = [...spec.tags, ...spec.rules.flatMap((rule) => rule.tags), ...spec.scenarios.flatMap((scenario) => scenario.tags)]
    const examples = spec.scenarios.flatMap((scenario) => scenario.pickles.flatMap((pickle) => pickle.tags))
      .filter((tag) => tag !== `@${spec.kind}` || above.includes(tag))
    return [...above, ...examples]
  })
  return collect(written, (tag) => interpreted.has(tag) ? "interprets" : "carries")
}

/** The example workspace adopters copy: what its specs and code teach is this repository's word too. */
const example = "examples/shop"

/** This repository, then its example workspace, each read from disk with its own configuration. */
const projects = (project: Project) =>
  loadProject(join(project.root, example), { withResults: false }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.map((shop): ReadonlyArray<Project> => [project, shop])
  )

/** The words of several projects as one; where they differ on what sdp does with a word, the first says it. */
const together = (each: ReadonlyArray<Words>): Words => new Map(each.toReversed().flatMap((words) => [...words]))

/** Each class a scenario can name, with the header of the column that lists its words. */
const classes: ReadonlyMap<string, { readonly column: string; readonly words: (project: Project) => Words }> = new Map([
  ["kinds", { column: "kind", words: kinds }],
  ["relations", { column: "relation", words: relations }],
  ["facts", { column: "fact", words: facts }],
  ["tags", { column: "tag", words: tags }]
])

const sdpValues: ReadonlyArray<Sdp> = ["makes", "interprets", "carries"]

/**
 * Holds the words in use against a table `| <column> | sdp | meaning |`: the same words, each with
 * what sdp does with it and a meaning. sdp cannot judge a meaning, so it only requires one.
 */
const holds = (what: string, column: string, used: Words, table: Table | undefined) => {
  assert.ok(table && table.length > 0, `expected a table | ${column} | sdp | meaning |`)
  const header = table[0]!.map((cell) => cell.trim())
  assert.deepEqual(header, [column, "sdp", "meaning"], `the table of ${what} has the columns | ${column} | sdp | meaning |`)
  const listed = new Map<string, { sdp: string; meaning: string }>()
  const problems: Array<string> = []
  for (const [word = "", sdp = "", meaning = ""] of table.slice(1).map((row) => row.map((cell) => cell.trim()))) {
    if (listed.has(word)) problems.push(`${word} is listed twice`)
    if (!(sdpValues as ReadonlyArray<string>).includes(sdp)) problems.push(`${word}: sdp is one of ${sdpValues.join(", ")}, not "${sdp}"`)
    if (meaning === "") problems.push(`${word} has no meaning`)
    listed.set(word, { sdp, meaning })
  }
  const unlisted = [...used].filter(([word]) => !listed.has(word)).map(([word, sdp]) => `${word} (sdp ${sdp})`)
  const unused = [...listed.keys()].filter((word) => !used.has(word))
  const misread = [...used].filter(([word, sdp]) => listed.has(word) && listed.get(word)!.sdp !== sdp)
    .map(([word, sdp]) => `${word}: sdp ${sdp}, not ${listed.get(word)!.sdp}`)
  if (unlisted.length > 0) problems.push(`used here and not listed: ${unlisted.join(", ")}`)
  if (unused.length > 0) problems.push(`listed and used nowhere: ${unused.join(", ")}`)
  problems.push(...misread)
  assert.deepEqual(problems, [], `the ${what} of this repository differ from the table:\n  ${problems.join("\n  ")}`)
}

/** The `types` section of what `sdp vocabulary --json` printed last. */
const printedTypes = (world: World): { readonly links: Record<string, { from: Array<string>; to: Array<string> }>; readonly facts: Record<string, { value: string; on: Array<string> }> } => {
  const types = JSON.parse(stdout(world))?.data?.types
  assert.ok(types, "run `sdp vocabulary --json` first: no types were printed")
  // The ends and placements are lists of kinds, not a sentence that reads like one.
  const lists = [
    ...Object.values(types.links ?? {}).flatMap((type: any) => [type.from, type.to]),
    ...Object.values(types.facts ?? {}).map((type: any) => type.on)
  ]
  assert.ok(lists.every((list) => Array.isArray(list) && list.every((kind: unknown) => typeof kind === "string")), "each end and placement is a list of kinds")
  return types
}

export default defineSteps(newWorld, ({ Then }) => {
  // The type table as sdp prints it: every typed relation, each end a comma-separated list.
  Then("the link types are:", ({ table, world }) =>
    assertRows(
      "link types",
      Object.entries(printedTypes(world).links).map(([relation, type]) => ({ relation, from: show(type.from), to: show(type.to) })),
      table,
      "exactly"
    ))

  Then("the fact types are:", ({ table, world }) =>
    assertRows(
      "fact types",
      Object.entries(printedTypes(world).facts).map(([fact, type]) => ({ fact, value: type.value, on: show(type.on) })),
      table,
      "exactly"
    ))

  Then("the {word} of this repository are:", ({ args: [name], table, project }) => {
    const known = classes.get(name)
    assert.ok(known, `no class of words "${name}"; there are: ${[...classes.keys()].join(", ")}`)
    return projects(project).pipe(Effect.map((all) => holds(name, known.column, together(all.map(known.words)), table)))
  })

  Then("the facts of this repository's code annotations are:", ({ table, project }) =>
    projects(project).pipe(Effect.map((all) => holds("facts of code annotations", "fact", together(all.map(annotationFacts)), table))))
})
