/**
 * 5 architecture: the elements and patterns the architect declared (`@sdp is` in a doc comment), and
 * nothing harvested from code. Each with where it is declared, what it imports or who applies it,
 * the work it carries — features realized by it, live and still to come — and what it is for.
 *
 * FINDING: an element's node has no description; what it is for is the doc comment of the code that
 * declares it, a join through `is`. Where several files declare one element, sdp's node points at
 * one of them (the first by path), whose comment describes that file, not the element: ARCH-application
 * would read "The envelope of every answer". So a purpose is shown only where one declaration is the
 * element's; elsewhere `files=N` says that N declare it and none says what it is for.
 */
import { at, type Graph, type Node, type Recipe, type Row, sentence, toCome } from "../lib.ts"

/** What a node is for: the first sentence of the doc comment that declares it, where only one does. */
const purpose = (graph: Graph, node: Node): string | undefined => {
  const declaring = graph.into(node.id, "is")
  if (declaring.length !== 1) return undefined
  return sentence(graph.node(declaring[0]!.from)?.attrs["doc"] as string | undefined, 100)
}

const work = (graph: Graph, element: string): string | undefined => {
  const features = graph.into(element, "realized-by").map((e) => graph.node(e.from)).filter((n): n is Node => n !== undefined)
  const live = features.filter((f) => !toCome(f))
  const coming = features.filter(toCome)
  const rules = live.reduce((n, f) => n + graph.rulesOf(f.id).filter(toCome).length, 0)
  const parts = [
    ...(live.length > 0 ? [`live ${live.length}`] : []),
    ...(rules > 0 ? [`+${rules} rules to come`] : []),
    ...(coming.length > 0 ? [`to come ${coming.map((f) => f.id).join(",")}`] : [])
  ]
  return parts.length === 0 ? undefined : `features ${parts.join(", ")}`
}

export default {
  title: "the declared architecture: elements and patterns",
  asks: ["graph", "vocabulary"],
  legend: "element|pattern id file:line files=declaring code · imports · applies · features realized by it · what it is for, where one declaration says it",
  rows: ({ graph, vocabulary }) => {
    const architectural = vocabulary.vocabulary.kinds["architectural"] ?? []
    const patterns = new Set(vocabulary.vocabulary.kinds["pattern"] ?? [])
    const rows: Array<Row> = []
    for (const node of graph.nodes) {
      if (!architectural.includes(node.kind)) continue
      const isPattern = patterns.has(node.kind)
      const files = graph.into(node.id, "is").length
      const what = isPattern
        ? [`applied by ${graph.into(node.id, "applies").map((e) => e.from).filter((id) => !id.startsWith("code:")).join(",") || "-"}`]
        : [
          `imports ${graph.out(node.id, "imports").map((e) => e.to).join(",") || "-"}`,
          ...graph.out(node.id, "applies").map((e) => `applies ${e.to}`),
          ...[work(graph, node.id)].filter((w) => w !== undefined)
        ]
      rows.push({ rec: node.kind, id: node.id, at: at(node), files: `files=${files}`, what: [...what, purpose(graph, node)].filter(Boolean).join(" · ") })
    }
    return rows
  }
} satisfies Recipe
