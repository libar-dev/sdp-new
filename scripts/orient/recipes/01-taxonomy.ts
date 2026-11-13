/**
 * 1 taxonomy: every word that can be modeled here — kind, relation, fact, tag — with what sdp does
 * with it, its type, how often it is used and what it means.
 *
 * What sdp does and how often come from sdp; the type is the type table of `sdp vocabulary`; the
 * meaning is this repository's pin, the tables of the guide PIN, read from its file because no
 * surface of sdp serves them (FINDING: `sdp graph` carries a scenario's step count, not its steps or
 * tables, and `sdp context` prints neither).
 */
import { clip, type Recipe, type Row, type State } from "../lib.ts"

const PIN = "every-word-is-defined-and-used"

const list = (v: string | ReadonlyArray<string>): ReadonlyArray<string> => (typeof v === "string" ? [v] : v)

/** How much of a meaning a text line shows; `--json` has it whole, and its line in the pin. */
const WIDTH = 64

/** The pin's tables, by the word in their first header cell: word → its sdp cell, meaning and line. */
const pinTables = (state: State) => {
  const node = state.graph.node(PIN)
  const tables = new Map<string, Map<string, { sdp: string; meaning: string; line: number }>>()
  if (node?.file == null) return tables
  let header: ReadonlyArray<string> | undefined
  for (const [i, line] of state.read(node.file).split("\n").entries()) {
    if (!line.trim().startsWith("|")) {
      header = undefined
      continue
    }
    const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim())
    if (header === undefined) {
      header = cells
      continue
    }
    const table = tables.get(header[0]!) ?? new Map<string, { sdp: string; meaning: string; line: number }>()
    table.set(cells[0]!, { sdp: cells[1]!, meaning: cells[2]!, line: i + 1 })
    tables.set(header[0]!, table)
  }
  return tables
}

export default {
  title: "what can be modeled: the words of this workspace",
  asks: ["vocabulary", "graph"],
  reads: (state) => [`pin ${state.graph.node(PIN)?.file ?? `${PIN} (not found)`}`],
  legend: "rec word sdp used type meaning · sdp: makes=nobody writes it, interprets, carries=the team's word; *=not in the pin · meaning: the pin's, cut",
  rows: (state) => {
    const json = state.json
    const { graph, vocabulary: v } = state
    const pin = pinTables(state)
    const sdpOf = (table: string, word: string, derived: () => string) => pin.get(table)?.get(word)?.sdp ?? `${derived()}*`
    const meaning = (table: string, word: string) => {
      const row = pin.get(table)?.get(word)
      return row === undefined ? undefined : json ? `${row.meaning} (pin:${row.line})` : clip(row.meaning, WIDTH)
    }
    const interpreted = new Set([...Object.values(v.vocabulary.kinds).flatMap(list), ...Object.values(v.vocabulary.disciplines).flat()])
    const rows: Array<Row> = []
    const unused: Array<string> = []

    // Kinds: what a node is.
    const kindCount = new Map<string, number>()
    for (const n of graph.nodes) kindCount.set(n.kind, (kindCount.get(n.kind) ?? 0) + 1)
    const kinds = new Set([...(pin.get("kind")?.keys() ?? []), ...kindCount.keys(), ...v.made.kinds, ...interpreted])
    for (const kind of kinds) {
      const used = kindCount.get(kind) ?? 0
      if (used === 0 && !pin.get("kind")?.has(kind)) {
        unused.push(`${kind}(kind)`)
        continue
      }
      // What sdp groups the kind under: its roles, and the discipline whose work it is.
      const roles = Object.entries(v.vocabulary.kinds).filter(([role, ks]) => role !== kind && list(ks).includes(kind)).map(([role]) => role)
      const discipline = Object.entries(v.vocabulary.disciplines).find(([, ks]) => ks.includes(kind))?.[0]
      const type = [...roles, ...(discipline === undefined ? [] : [`work:${discipline}`])].join(",") || undefined
      const sdp = sdpOf("kind", kind, () => (v.made.kinds.includes(kind) ? "makes" : interpreted.has(kind) ? "interprets" : "carries"))
      rows.push({ rec: "kind", word: kind, sdp, used, type, meaning: meaning("kind", kind) })
    }

    // Relations: what an edge says.
    const relCount = new Map<string, number>()
    for (const e of graph.edges) relCount.set(e.rel, (relCount.get(e.rel) ?? 0) + 1)
    const configured = new Set(Object.values(v.vocabulary.relations).flatMap(list))
    const rels = new Set([...(pin.get("relation")?.keys() ?? []), ...relCount.keys(), ...Object.keys(v.types.links), ...v.made.relations])
    for (const rel of rels) {
      const used = relCount.get(rel) ?? 0
      if (used === 0 && !pin.get("relation")?.has(rel)) {
        unused.push(`${rel}(rel)`)
        continue
      }
      const t = v.types.links[rel]
      const sdp = sdpOf("relation", rel, () => (v.made.relations.includes(rel) ? "makes" : configured.has(rel) ? "interprets" : "carries"))
      rows.push({ rec: "rel", word: rel, sdp, used, type: t && `${t.from.join(",")}→${t.to.join(",")}`, meaning: meaning("relation", rel) })
    }

    // Facts: @key=value. FINDING: `id` and `kind` are facts nobody can count from the graph's attrs.
    const facts = new Set([...(pin.get("fact")?.keys() ?? []), ...Object.keys(v.types.facts)])
    for (const key of facts) {
      const used = key === "id" || key === "kind" ? undefined : graph.nodes.filter((n) => n.attrs[key] !== undefined).length
      if (used === 0 && !pin.get("fact")?.has(key)) {
        unused.push(`${key}(fact)`)
        continue
      }
      const t = v.types.facts[key]
      rows.push({ rec: "fact", word: key, sdp: sdpOf("fact", key, () => "interprets"), used, type: t && `${t.value} on ${t.on.join(",")}`, meaning: meaning("fact", key) })
    }

    // Cucumber tags sdp reads.
    for (const tag of new Set([...(pin.get("tag")?.keys() ?? []), ...v.made.tags])) {
      // Counted on every node that carries it; a Cucumber tag is inherited, so a scenario counts its rule's.
      const used = graph.nodes.filter((n) => ((n.attrs["tags"] as ReadonlyArray<string> | undefined) ?? []).includes(tag)).length
      rows.push({ rec: "tag", word: tag, sdp: sdpOf("tag", tag, () => "interprets"), used, type: undefined, meaning: meaning("tag", tag) })
    }

    // The categories the type table names that are not kinds. FINDING: `sdp vocabulary` names them
    // and does not resolve them; this is the rule of src/model/Vocabulary.ts (isEnd), restated.
    const work = Object.values(v.vocabulary.disciplines).flat()
    rows.push({ rec: "ends", word: "work", sdp: undefined, used: undefined, type: work.join(","), meaning: "kinds a discipline names: to come at a maturity, then live" })
    rows.push({ rec: "ends", word: "spec", sdp: undefined, used: undefined, type: "any kind sdp does not make", meaning: undefined })
    rows.push({ rec: "ladder", word: "maturity", sdp: undefined, used: undefined, type: v.vocabulary.maturity.join("<"), meaning: "declared while to come; built declares none" })
    rows.push({ rec: "ladder", word: "stage", sdp: "makes", used: undefined, type: v.made.stages.join(","), meaning: "derived for live work from its examples" })
    if (unused.length > 0) rows.push({ rec: "unused", word: unused.join(" ") })
    return rows
  }
} satisfies Recipe
