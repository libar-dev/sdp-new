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

| # | Section | What it answers |
| --- | --- | --- |
| 1 | `taxonomy` | every word in use: made, interpreted or carried by sdp, its type, its meaning from the pin |
| 2 | `now` | the milestone, its gate as last run, the iterations |
| 3 | `to-come` | work still to come at every maturity, with its plan, examples, epic and route to code |
| 4 | `open` | the questions waiting on the owner |
| 5 | `architecture` | declared elements and patterns: imports, patterns applied, work carried, purpose |
| 6 | `bounds` | decisions, architecture rules, guides and the vision, as pointers |
| 7 | `ask` | sdp's few verbs, each on a real id |
| 8 | `sample` | a hard-coded walk from two features still to come to the code they will change |

`--only now,open` is a candidate for what a session hook could show; the whole run explores a first
fetch. Neither its scope nor its size is settled. The sample walks the ids in `SAMPLE` at the top
of `recipes/08-sample.ts`: set it to any feature to walk that one
(`node scripts/orient/orient.ts --only sample`). `--sizes` measures each section today.

A line is cells apart by tabs: what the line is first (`kind`, `tocome`, `open`, `element`…), then
ids and `file:line`, free text last. A section's header names the sdp commands it was derived from.

## What section 8 shows

Work still to come and its executable specs, connected to the live code an architect selected,
through the taxonomy:

| Relationship | In the sample | What it tells the reader |
| --- | --- | --- |
| `rule → rule-of → feature` | the rules of `keep-a-vocabulary` | what the proposed capability must do |
| `rule → decided-by → decision` | rules of `keep-a-vocabulary` rest on `free-vocabulary` | which choice constrains the work |
| `feature → realized-by → element` | `keep-a-vocabulary → ARCH-vocabulary, ARCH-checker, ARCH-application` | which parts of the architecture the work concerns |
| `code → is → element` | `src/model/Vocabulary.ts → ARCH-vocabulary` | a significant whole file, anchored |
| `code → is → element` | `src/check/Check.ts#check → ARCH-checker` | a significant single function, anchored |
| `element → imports → element` | `ARCH-checker → ARCH-vocabulary` | a relationship derived from the code's imports |
| `element → applies → pattern` | `ARCH-application → PAT-answer` | a shared pattern the element's code applies |
| `epic → includes → feature, rule` | `answers-shaped-for-agents → list-the-open-questions` and its siblings | how the work is grouped for delivery |

The `also` rows walk back from an element to the live specs of its behaviour today:
`keep-a-vocabulary → realized-by → ARCH-vocabulary ← realized-by ← configure-a-workspace, link-specs`.

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
