# Orientation (prototype)

What an agent, or a person, fetches first on this repository: the state that helps build work still
to come or refine its specs, compressed, each line pointing to `file:line` where the spec or code is
read. A prototype to find the minimal state and API sdp should serve; not wired into any hook.

```sh
node scripts/orient/orient.ts                        # every section, as text
node scripts/orient/orient.ts --only to-come,open     # some, by name or number
node scripts/orient/orient.ts --json | jq -c 'select(.rec=="tocome" and .maturity=="ready")'
node scripts/orient/orient.ts --sizes                 # characters per section, on stderr
node scripts/orient/orient.ts | column -ts$'\t'       # aligned, for a person
node scripts/orient/orient.ts my-recipe.ts            # a recipe of your own, after the shipped ones
```

A line is cells apart by tabs: what the line is first (`kind`, `tocome`, `open`, `element`…), then
ids and `file:line`, free text last. A section's header names the sdp commands it was derived from.

## Writing a recipe

A file `recipes/NN-name.ts` (or any path given as an argument) whose default export is a `Recipe`:

```ts
import { at, type Recipe } from "../lib.ts"

/** Live features no element realizes: built code no element of the architecture owns. */
export default {
  title: "live features with no element",
  asks: ["graph"],                       // the sdp surfaces it reads: graph, vocabulary, lifecycle
  rows: ({ graph }) =>
    graph.ofKind("feature")
      .filter((f) => f.attrs["toCome"] !== true && graph.out(f.id, "realized-by").length === 0)
      .map((f) => ({ rec: "unrealized", id: f.id, at: at(f) }))
} satisfies Recipe
```

`rows` returns plain objects: `rec` first, free text last, `undefined` for no value. The runner asks
sdp for each surface once (sdp.ts), prints the rows as text or JSON lines, and measures them. A
helper in lib.ts is a join sdp did not answer, and says so (`FINDING:`).
