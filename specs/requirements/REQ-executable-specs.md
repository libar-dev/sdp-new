---
id: REQ-executable-specs
kind: requirement
title: Executable specifications
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [execution]
links:
  refines: CAP-living-specs
  realized-by: ARCH-runner
  decided-by: [DEC-0005, DEC-0001, DEC-0011]
---

# Executable specifications

The scenarios in a spec run as tests once step definitions exist — without rewriting them. Before
that, they are still valid specifications: a step without a definition is *undefined*, which means
"not automated yet", not "broken". Results roll up into each spec's `verification` and `stage`, so
the difference between specified and implemented is evidence, not a status someone remembered to
update. The spec never changes format; only the evidence around it does.

## Step definitions

Step definitions are TypeScript or JavaScript modules found by the `steps` globs of the
configuration ([[REQ-configuration]]). Each binds Cucumber Expressions to handlers:

```ts
// specs/steps/cart.steps.ts
import { Effect } from "effect"
import { defineSteps, pending } from "sdp/steps"

export default defineSteps(() => ({ cart: [] as Array<string> }), ({ Given, When, Then }) => {
  Given("a cart with {int} items", ({ world, args: [n] }) => { world.cart = Array(n).fill("item") })
  When("the guest checks out with a valid card", () => pending("payment sandbox not wired yet"))
  Then("an order is created", ({ world }) => Effect.sync(() => { /* assert */ }))
})
```

- **Parameters are typed by the expression**: `{int}` and `{float}` arrive as numbers; `{string}`
  (in `"` or `'` quotes), `{word}` and `{}` as strings. A regular expression passes its captures on
  as the text they matched, `undefined` for a group that took no part. A step's doc string arrives
  as `doc`, its data table as `table` (rows of cells).
- **Handlers** return nothing, a Promise or an Effect. A thrown error, a rejected Promise or a failed
  Effect fails the step; `pending(reason)`, returned or thrown, marks it recognised but not
  implemented.
- **Timeouts are cooperative.** A step has 30 seconds. When they are over the step fails, and the
  context's `signal`, an `AbortSignal`, aborts — as it does when the run is interrupted. An Effect
  is interrupted either way; a Promise keeps running unless its handler passes the signal on — to
  `fetch`, a child process, a timer. Code that never yields cannot be stopped at all: such a step
  fails as timed out once it returns. Killing a step that hangs is an idea
  ([[REQ-step-isolation]]).
- **Worlds.** The first argument of `defineSteps` is a world factory. Every scenario gets a fresh
  world per factory; modules passing the same factory share that world, so a step library can be
  split across files (sdp's own steps share `specs/steps/world.ts`). A world is made as part of the
  first step that needs it: a factory that throws fails that step, naming the module.
- Steps match by text, not keyword: `Given`, `When`, `Then` and `Step` register alike.
- **`import … from "sdp/steps"`** — and `"sdp/annotations"` in the application code the steps
  exercise — always resolve to the sdp that runs the steps, so a workspace needs no package
  installed for it, and step modules and runner never disagree about versions. `sdp/steps` is all
  a step file needs: importing it loads no parser and reads no workspace (`sdp` is the
  programmatic API).
- A step file must export its module (`export default defineSteps(…)`); one that exports none is
  noted, and one that fails to load stops the run with one line naming the file ([[REQ-cli]]).

### Reading step definitions never runs them

Only `sdp run` and `sdp gate` import step modules. Everything else that needs to know the step
definitions — `sdp context`, `sdp steps`, `sdp check`, the MCP tools — reads the step files
statically, as it reads `annotate()` calls ([[ARCH-code-annotations]]), so inspecting a workspace
executes none of its code:

| In a step file | Read as |
| --- | --- |
| `defineSteps(world, ({ Given, When, Then, Step }) => { … })` at the top level, `defineSteps` imported from `sdp/steps` | a step module; the registrar may be destructured, renamed (`{ Given: given }`) or taken whole (`(steps) => steps.Given(…)`) |
| `Given("a cart with {int} items", …)`, a template without placeholders, or `Given(/^a cart$/, …)` anywhere in that callback | a step definition, with its keyword, expression and `file:line` |
| a registration whose expression is computed, or a step file without such a `defineSteps` call | `step-unreadable` ([[REQ-check-rules]]): only a run knows that step |
| a Cucumber Expression that is malformed | `step-expression`, an error: `sdp run` refuses to start, naming its `file:line` |

`sdp steps [text]` lists what was read, sdp's built-in steps included ([[REQ-cli]]). What could
not be read is never passed over in silence: `sdp steps`, the context bundle and `sdp_snippets`
name each such registration with its `file:line`, because a step they show as undefined may be
defined there.

Not supported yet: custom parameter types and Before/After hooks ([[REQ-cucumber-compatibility]]).

## Statuses

`sdp run` compiles every scenario to examples — a Scenario Outline yields one per row of its
Examples table — and matches each step against every step definition.

| Step status | Meaning |
| --- | --- |
| `passed` | the handler succeeded |
| `failed` | the handler threw, rejected, failed or timed out |
| `pending` | the handler returned or threw `pending()` |
| `undefined` | no definition matches: not automated yet, *not* a failure; it comes with a suggested definition |
| `ambiguous` | more than one definition matches; the error names them |
| `skipped` | an earlier step of the same example did not pass |

A scenario without any steps is `undefined` as a whole: nothing in it is automated.

`--tags` selects examples, not whole scenarios: an example runs when its own tags — those of its
feature, its scenario and its Examples block — match. An example a run did not select is recorded
as `skipped`, without steps.

Every step is matched even after one did not pass, so one run reports every missing and ambiguous
definition; only execution stops. An example's status is the worst of its steps, and a scenario's
the worst of its examples, in this order: `failed`, `ambiguous`, `undefined`, `pending`, `skipped`,
`passed`. A scenario therefore stays `undefined` until every step has a definition; the stubs that
`--snippets` suggests return `pending()`, so pasting them turns it `pending` until they are
implemented. Likewise a scenario is `passed` only when one run executed and passed every example:
a run that selected some examples of an outline leaves it `skipped` at best.

Matching needs no run: `sdp context <id>` and the MCP tool `sdp_snippets` match a spec's steps
against the step definitions as read from the step files and list those without exactly one
([[REQ-agent-context]]).
A suggested definition is registered with the keyword the step means — `And` and `But` take the
keyword before them, `*` registers with `Step`. `sdp run --snippets` prints all suggestions of a run
as one module to save as a `.steps.ts` file: imports, a world factory, and each expression once
(defining it twice would make the step ambiguous), naming the existing step files it could join.

## Evidence

The statuses of a spec's scenarios roll up into the spec (the first matching row applies):

| Scenario statuses | `verification` | `stage` |
| --- | --- | --- |
| no scenarios | `none` | declared maturity |
| any failed or ambiguous | `failing` | `failing` |
| all passed | `passing` | `verified` |
| none run yet, or all stale | `unrun` | declared maturity |
| each undefined or not run | `undefined` | declared maturity |
| anything else: some pending, or some passed while others are not | `partial` | `in-progress` |

`verified` therefore promises exactly this, and nothing wider: **every scenario of the spec
passed against the fingerprinted inputs below, and none of them has changed since.** It says
nothing about what sdp was not told of — a service the steps call, the clock, a file read while
running that `evidence.inputs` does not name ([[DEC-0011]]).

### What a result records

`sdp run` records one result per scenario in `.sdp/results.json` (the `results` setting): its
status, each example's steps with their status, error, matching definition (`file:line`),
suggested definition and duration, and fingerprints of what it ran against. A result counts only
while every fingerprint it recorded still matches the workspace. Otherwise it is **stale** — kept,
but not counted: the scenario node's `status` is `stale`, and `staleBecause` names the first
fingerprint that differs.

| Recorded | Covers | `staleBecause` |
| --- | --- | --- |
| `hash` | what a handler can observe of the scenario: each example's name, its tags — those inherited from the spec, the feature, the rule and the Examples block too — step text, doc strings and tables | `scenario-changed` |
| `evidence.sources` | the configuration file, the code (`code` globs), the step definition files (`steps` globs) and every workspace file they imported up to the end of the run, one that a handler imports only while it runs included; a file added or removed counts | `code-changed` |
| `evidence.toolchain` | the sdp version, the Node.js major version, and the lockfile at the workspace root (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`) | `toolchain-changed` |
| `evidence.inputs` | what the configuration declares ([[REQ-configuration]]): the files matching `evidence.inputs` — fixtures, data — and the environment variables named in `evidence.env`, set or not; only a digest is stored, never a value | `inputs-changed` |
| `evidence.specs` | the spec and feature files; recorded when a step read the graph (`project`), as the built-in steps do | `specs-changed` |
| `evidence.results` | the statuses of the ordinary scenarios; recorded when a gate read the graph | `results-changed` |

A spec whose scenarios are all stale is back at its declared maturity, so nothing stays `verified`
on evidence about other code, and a gate that requires verified work is unmet until the scenarios
run again. Invalidation is deliberately coarse: any change to the code invalidates every result,
and the first run that reaches a lazily imported file leaves results recorded before it stale
once. `sdp status` counts stale results by reason; `sdp run` says how many earlier results it
left stale — those it did not select.

### Layers

Evidence is layered so that no scenario reads the layer it belongs to:

| Scenario | The graph it sees (`project`) |
| --- | --- |
| ordinary | no results: every scenario `unrun`, every spec at its declared maturity |
| gate | the results of the ordinary scenarios, those of this run included; never the result of a gate, its own included |

An ordinary scenario therefore cannot depend on another scenario's outcome, nor a gate on a
gate's. A scenario that asserts on delivery state is a gate — tag it `@gate` or put it in a
milestone — and a built-in step that reads `stage`, `verification`, `staleBecause`, `lastRun` or a
scenario's `status` in an ordinary scenario fails and says so ([[REQ-builtin-steps]]). Every other
reader — `sdp status`, `sdp q`, context bundles — sees all results that still count.

### The results file

Runs may overlap: agents, shells, CI jobs. A run records only what it executed. It takes a lock
(`<results>.lock`), reads the file as it is then, replaces the results of the scenarios it ran,
drops those of scenarios that no longer exist, and puts the new file in place in one step — so a
partial run (`sdp run <ids or paths>`, `--tags`) keeps everything else, and two runs at once never
restore what the other replaced. A run that cannot get the lock within two seconds fails, naming
the lock file. The file is generated; never edit it by hand.

It is plain JSON, one flat record per scenario, made to be taken apart with `jq`:

| Where | Fields |
| --- | --- |
| top level | `version`; `runAt`; `imports`, the workspace files step definitions imported in any run; `scenarios`, keyed by scenario id |
| `scenarios.<id>` | `id`, `spec`, `name`, `file`, `line`, `status`, `runAt`, `durationMs`, `hash`, `evidence` (the fingerprints above), `examples` |
| `examples[]` | `name`, `status`, `exampleLine` for a row of an outline, `steps` |
| `steps[]` | `keyword`, `text`, `line`, `status`, `durationMs`, and where they apply `error`, `definition` (`file:line`), `snippet` |

```sh
jq -r '.scenarios[] | select(.status != "passed") | [.file, .line, .status, .id] | @tsv' .sdp/results.json
```

## Runs need readable specs

A run that cannot read every scenario does not start. When Gherkin or front matter does not parse
(`gherkin-syntax`, `front-matter`), a file plainly meant as a spec — a `kind` in its front matter,
or a Gherkin block — has no id (`missing-id`, so its scenarios would be dropped silently), or an
id is declared twice (`duplicate-id`, so results could be filed under the wrong scenario),
`sdp run` and `sdp gate` list those errors, one line each with `file:line`, and exit with 1 before
anything executes or is recorded ([[REQ-cli]]). Other errors
`sdp check` reports, such as a dangling link, leave every scenario readable and do not stop a run;
neither do undefined steps, which are specifications not automated yet.

## Gates and records that no longer apply

`sdp run` executes ordinary scenarios first and **gate scenarios** second — scenarios of milestones
(`kind: milestone`) and scenarios tagged `@gate` — against a graph rebuilt with the fresh results
of the ordinary ones (*Layers* above), so a gate can require what the run just verified; with
`--tags`, a scenario is a gate when a selected example is tagged `@gate`. Gates assert against the graph with built-in steps
([[REQ-builtin-steps]]). An unmet gate is reported but does not fail `sdp run`, because a future
milestone is expected to be unmet; `sdp gate <milestone>` ([[REQ-cli]]) evaluates one milestone
and exits with 1 while it is unmet. A failed or ambiguous ordinary scenario does fail `sdp run`.

Specs whose `status` is `superseded`, `rejected` or `deprecated` keep their text but do not run: a
decision that no longer applies stops guarding anything.

## Running concurrently

`sdp run --concurrency <n>` runs up to `n` scenarios at once, which pays off when steps wait on
processes, files or networks. Scenarios tagged `@serial` — timing measurements, anything sharing a
resource — always run alone, after the others; with `--tags`, those with a selected example tagged
`@serial`. Results are reported once each and in scenario order whatever finishes first — one
reporter publishes them, however slow it is — so output stays stable.
The default is one at a time, because step definitions written for a sequential run may share
state.

## Scenarios

Every scenario starts from a cart spec whose steps nobody has automated yet. Step definitions are
scripted per scenario (`Given a step definition "…" that passes`); small extra fixtures are classic
`.feature` files, which are specs too ([[REQ-progressive-specs]]).

~~~gherkin
Background:
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: Add an item
      Given an empty cart
      When I add a lamp
      Then the cart holds 1 item
    ```
    """
~~~

### Evidence

~~~gherkin
Scenario: Until its scenarios run, a spec's stage is its declared maturity
  Given a file "specs/REQ-wishlist.md" containing:
    """
    ---
    id: REQ-wishlist
    maturity: idea
    ---
    # Wishlist
    """
  When the workspace is loaded
  Then node "REQ-cart#add-an-item" has attribute status = "unrun"
  And node "REQ-cart" has attribute verification = "unrun"
  And node "REQ-cart" has attribute stage = "ready"
  And node "REQ-wishlist" has attribute verification = "none"
  And node "REQ-wishlist" has attribute stage = "idea"

Scenario: Without step definitions a spec is simply not automated yet
  When the scenarios are run
  Then scenario "REQ-cart#add-an-item" has status "undefined"
  And node "REQ-cart" has attribute verification = "undefined"
  And node "REQ-cart" has attribute stage = "ready"

Scenario: A scenario without steps automates nothing
  Given a file "specs/REQ-later.md" containing:
    """
    ---
    id: REQ-later
    maturity: draft
    ---
    # Later

    Something to specify.

    ```gherkin
    Scenario: To be written
    ```
    """
  When the scenarios are run
  Then scenario "REQ-later#to-be-written" has status "undefined"
  And node "REQ-later" has attribute stage = "draft"

Scenario: A scenario stays undefined until every step has a definition
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  When the scenarios are run
  Then scenario "REQ-cart#add-an-item" has status "undefined"
  And node "REQ-cart" has attribute stage = "ready"

Scenario Outline: Results of automated steps decide the stage
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that <adding>
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  Then scenario "REQ-cart#add-an-item" has status "<scenario>"
  And node "REQ-cart" has attribute verification = "<verification>"
  And node "REQ-cart" has attribute stage = "<stage>"

  Examples:
    | adding | scenario | verification | stage       |
    | passes | passed   | passing      | verified    |
    | pends  | pending  | partial      | in-progress |
    | fails  | failed   | failing      | failing     |

Scenario: A spec is verified only when every one of its scenarios passed
  Given a file "specs/REQ-wishlist.md" containing:
    """
    ---
    id: REQ-wishlist
    maturity: draft
    ---
    # Wishlist

    Shoppers keep items for later.

    ```gherkin
    Scenario: Keep a lamp
      Given an empty cart

    Scenario: Share the list
      Given a friend to share with
    ```
    """
  And a step definition "an empty cart" that passes
  When the scenarios are run
  Then scenario "REQ-wishlist#keep-a-lamp" has status "passed"
  And scenario "REQ-wishlist#share-the-list" has status "undefined"
  And node "REQ-wishlist" has attribute verification = "partial"
  And node "REQ-wishlist" has attribute stage = "in-progress"

Scenario: Editing a scenario makes its last result stale
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  And a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: Add an item
      Given an empty cart
      When I add two lamps
      Then the cart holds 2 items
    ```
    """
  Then node "REQ-cart#add-an-item" has attribute status = "stale"
  And node "REQ-cart#add-an-item" has attribute staleBecause = "scenario-changed"
  And node "REQ-cart" has attribute verification = "unrun"
  And node "REQ-cart" has attribute stage = "ready"

Scenario Outline: A tag is part of the scenario, wherever it is inherited from
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  And a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    <front matter>
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    <tag line>
    Scenario: Add an item
      Given an empty cart
      When I add a lamp
      Then the cart holds 1 item
    ```
    """
  Then node "REQ-cart#add-an-item" has attribute status = "stale"
  And node "REQ-cart#add-an-item" has attribute staleBecause = "scenario-changed"

  Examples:
    | front matter | tag line |
    |              | @slow    |
    | tags: [slow] |          |

Scenario Outline: A result counts only while what it ran against is unchanged
  Given a file "sdp.config.yaml" containing:
    """
    evidence:
      inputs: ["fixtures/**"]
    """
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  And a file "<file>" containing:
    """
    <content>
    """
  Then node "REQ-cart#add-an-item" has attribute status = "stale"
  And node "REQ-cart#add-an-item" has attribute staleBecause = "<reason>"
  And node "REQ-cart" has attribute stage = "ready"

  Examples:
    | file                      | content                       | reason            |
    | src/cart.ts               | export const lamps = 1        | code-changed      |
    | sdp.config.yaml           | results: .sdp/results.json    | code-changed      |
    | specs/steps/cart.steps.ts | export const phrases = []     | code-changed      |
    | package-lock.json         | { "lockfileVersion": 3 }      | toolchain-changed |
    | fixtures/lamps.json       | [{ "name": "Ada" }]           | inputs-changed    |

Scenario: A scenario that reads the graph also goes stale when a spec changes
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  And a file "specs/catalogue.feature" containing:
    """
    @id:REQ-catalogue
    Feature: Catalogue
      Scenario: The cart is specified
        Then the query "#REQ-cart" returns 1 result
    """
  When the scenarios are run
  And a file "specs/REQ-wishlist.md" containing:
    """
    ---
    id: REQ-wishlist
    ---
    # Wishlist
    """
  Then node "REQ-catalogue#the-cart-is-specified" has attribute status = "stale"
  And node "REQ-catalogue#the-cart-is-specified" has attribute staleBecause = "specs-changed"
  And node "REQ-cart#add-an-item" has attribute status = "passed"

Scenario: Changing what step definitions import leaves their results stale, and a gate on them unmet
  Given a file "docs/MS-beta.md" containing:
    """
    ---
    id: MS-beta
    kind: milestone
    ---
    # Beta

    ```gherkin
    Scenario: The cart works
      Then the node "REQ-cart" has stage "verified"
    ```
    """
  And a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"
    import { lamps } from "./lamps.ts"

    export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
      Given("an empty cart", () => {})
      When("I add a lamp", ({ world }) => {
        world.items += lamps
      })
      Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
        if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
      })
    })
    """
  And a file "specs/steps/lamps.ts" containing:
    """
    export const lamps = 1
    """
  When I run "sdp run"
  Then the output contains "1 gate scenario(s): 1 passed"
  Given a file "specs/steps/lamps.ts" containing:
    """
    export const lamps = 2
    """
  When I run "sdp status"
  Then the output contains "stale         code-changed 2"
  When I run "sdp gate MS-beta"
  Then the exit code is 1
  And the output contains 'REQ-cart.stage is "ready", expected "verified"'
  And the output contains "stale: 1 earlier result(s) no longer count (1 code-changed)"

Scenario: A file a handler imports only while it runs is part of what the result ran against
  Given a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
      Given("an empty cart", () => {})
      When("I add a lamp", async ({ world }) => {
        const { lamps } = await import("./lamps.ts")
        world.items += lamps
      })
      Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
        if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
      })
    })
    """
  And a file "specs/steps/lamps.ts" containing:
    """
    export const lamps = 1
    """
  When I run "sdp run"
  Then the output contains "1 scenario(s): 1 passed"
  When I run "sdp status"
  Then the output does not contain "stale"
  Given a file "specs/steps/lamps.ts" containing:
    """
    export const lamps = 2
    """
  When I run "sdp status"
  Then the output contains "stale         code-changed 1"

Scenario: A declared environment variable is part of the evidence, and only its digest is stored
  Given a file "sdp.config.yaml" containing:
    """
    evidence:
      env: [SHOP_REGION]
    """
  And a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Step }) => {
      Step("an empty cart", () => {})
      Step("I add a lamp", () => {})
      Step("the cart holds {int} item(s)", () => {
        if (process.env.SHOP_REGION !== "atlantis") throw new Error("no lamps here")
      })
    })
    """
  When I run "SHOP_REGION=atlantis sdp run"
  Then the output contains "1 scenario(s): 1 passed"
  And the file ".sdp/results.json" does not contain "atlantis"
  When I run "SHOP_REGION=atlantis sdp status"
  Then the output does not contain "stale"
  When I run "SHOP_REGION=lemuria sdp status"
  Then the output contains "stale         inputs-changed 1"
~~~

### Step definitions

~~~gherkin
Scenario Outline: Handlers return nothing, a Promise or an Effect
  Given a step definition "an empty cart" that <handler>
  When the scenarios are run
  Then the step "an empty cart" has status "<status>"

  Examples:
    | handler                     | status  |
    | returns nothing             | passed  |
    | throws an error             | failed  |
    | returns a resolved Promise  | passed  |
    | returns a rejected Promise  | failed  |
    | returns a successful Effect | passed  |
    | returns a failed Effect     | failed  |
    | returns pending()           | pending |
    | throws pending()            | pending |

Scenario Outline: A failing step reports the author's message
  Given a step definition "an empty cart" that <handler>
  When the scenarios are run
  Then the step "an empty cart" reports 'deliberate failure in "an empty cart"'

  Examples:
    | handler                                     |
    | throws an error                             |
    | returns a rejected Promise                  |
    | returns a failed Effect                     |
    | wraps a failing Promise in Effect.tryPromise |

Scenario Outline: Parameters are typed by the expression, and a regular expression passes on the text it captured
  Given a file "specs/pricing.feature" containing:
    """
    Feature: Pricing
      Scenario: Price a lamp
        Given <step>
    """
  And a step definition "<expression>" that records its arguments
  When the scenarios are run
  Then the handler received the arguments <arguments>

  Examples:
    | step                  | expression                  | arguments      |
    | 3 lamps cost 19.5     | {int} lamps cost {float}    | [3, 19.5]      |
    | the lamp "Ada" is red | the lamp {string} is {word} | ["Ada", "red"] |
    | a lamp for 2 rooms    | a lamp for {} rooms         | ["2"]          |
    | 4 lamps in the hall   | /^(\d+) lamps in the (\w+)$/ | ["4", "hall"]  |

Scenario: Doc strings and data tables reach the handler
  Given a file "specs/notes.feature" containing:
    """
    Feature: Notes
      Scenario: Take notes
        Given the note:
          ```
          Buy milk
          ```
        And the list:
          | milk  | 1 |
          | bread | 2 |
    """
  And a step definition "the note:" that records its arguments
  And a step definition "the list:" that records its arguments
  When the scenarios are run
  Then the handler received the doc string "Buy milk"
  And the handler received the table:
    | milk  | 1 |
    | bread | 2 |

Scenario Outline: Every scenario gets a fresh world, shared by the modules on one world factory
  Given a file "specs/shop.feature" containing:
    """
    @id:REQ-shop
    Feature: Shop
      Scenario: One lamp
        When I add a lamp
        Then the cart holds 1 item

      Scenario: Two lamps
        When I add a lamp
        And I add a lamp
        Then the cart holds 2 items
    """
  And the step definitions:
    | module   | world      | expression                   | behaviour                     |
    | cart     | shop       | I add a lamp                 | adds an item to its world     |
    | checkout | <checkout> | the cart holds {int} item(s) | checks the items in its world |
  When the scenarios are run
  Then scenario "REQ-shop#one-lamp" has status "<status>"
  And scenario "REQ-shop#two-lamps" has status "<status>"

  Examples:
    | checkout | status |
    | shop     | passed |
    | till     | failed |

Scenario: A step that outlasts its timeout fails
  Given a step definition "an empty cart" that takes a second
  When the scenarios are run with a step timeout of 50 ms
  Then the step "an empty cart" has status "failed"
  And the step "an empty cart" reports "step timed out"

Scenario: A step that never yields cannot be stopped, and fails once it returns late
  Given a step definition "an empty cart" that keeps the thread busy for 200 ms
  When the scenarios are run with a step timeout of 50 ms
  Then the step "an empty cart" has status "failed"
  And the step "an empty cart" reports "step timed out"

Scenario: A step that times out is told to stop through its signal
  Given a step definition "an empty cart" that waits for its signal
  When the scenarios are run with a step timeout of 50 ms
  Then the step "an empty cart" has status "failed"
  And the step "an empty cart" reports "step timed out"
  And the handler of "an empty cart" saw its signal abort

Scenario: Interrupting a run tells the running step to stop
  Given a step definition "an empty cart" that waits for its signal
  When the scenarios are run and interrupted while "an empty cart" runs
  Then the handler of "an empty cart" saw its signal abort

Scenario: A world factory that throws fails the step that needs the world
  Given a step definition "an empty cart" whose world factory throws
  And a step definition "I add a lamp" that passes
  When the scenarios are run
  Then the step "an empty cart" has status "failed"
  And the step "an empty cart" reports "could not create the world of cart: deliberate failure in the world factory"
  And the step "I add a lamp" has status "skipped"
~~~

### Matching

~~~gherkin
Scenario Outline: Every undefined step comes with a suggested definition
  When the scenarios are run
  Then the step "<step>" has status "undefined"
  And the step "<step>" suggests the definition '<suggestion>'

  Examples:
    | step                  | suggestion                                                               |
    | an empty cart         | Given("an empty cart", ({ world }) => pending())                         |
    | I add a lamp          | When("I add a lamp", ({ world }) => pending())                           |
    | the cart holds 1 item | Then("the cart holds {int} item", ({ world, args: [int] }) => pending()) |

Scenario: A step that matches more than one definition is ambiguous
  Given a step definition "an empty cart" that passes
  And a step definition "an {word} cart" that passes
  When the scenarios are run
  Then the step "an empty cart" has status "ambiguous"
  And the step "an empty cart" reports "matches 2 definitions"
  And node "REQ-cart" has attribute verification = "failing"

Scenario Outline: After a step that does not pass, the rest are skipped but still matched
  Given a step definition "an empty cart" that <first step>
  And a step definition "I add a lamp" that passes
  When the scenarios are run
  Then the step "an empty cart" has status "<status>"
  And the step "I add a lamp" has status "skipped"
  And the step "the cart holds 1 item" has status "undefined"

  Examples:
    | first step | status  |
    | fails      | failed  |
    | pends      | pending |
~~~

### Step modules

~~~gherkin
Scenario: A step module imports sdp without installing it
  Given a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
      Given("an empty cart", () => {})
      When("I add a lamp", ({ world }) => {
        world.items++
      })
      Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
        if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
      })
    })
    """
  When I run "sdp run"
  Then the output contains "1 scenario(s): 1 passed"

Scenario: Annotated application code under test imports sdp/annotations without installing it
  Given a file "src/cart.ts" containing:
    """
    import { annotate } from "sdp/annotations"

    export const lamp = () => 1
    annotate(lamp, { implements: "REQ-cart" })
    """
  And a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"
    import { lamp } from "../../src/cart.ts"

    export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
      Given("an empty cart", () => {})
      When("I add a lamp", ({ world }) => {
        world.items += lamp()
      })
      Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
        if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
      })
    })
    """
  When I run "sdp run"
  Then the output contains "1 scenario(s): 1 passed"

Scenario: The step API loads no parser and reads no workspace
  When a fresh Node process imports "sdp/steps"
  Then the output contains "/src/run/Steps.ts"
  And the output does not contain "oxc-parser"
  And the output does not contain "/src/parse/"
  And the output does not contain "/src/graph/"
  And the output does not contain "/src/workspace/"

Scenario Outline: Reading a workspace runs none of its step files
  Given a file "specs/steps/cart.steps.ts" containing:
    """
    import { writeFileSync } from "node:fs"
    import { defineSteps } from "sdp/steps"

    writeFileSync("executed.txt", "this step file ran")

    export default defineSteps(() => ({}), ({ Given }) => {
      Given("an empty cart", () => {})
    })
    """
  When I run "<command>"
  Then the exit code is 0
  And the file "executed.txt" <is there or not>

  Examples:
    | command              | is there or not                |
    | sdp context REQ-cart | does not exist                 |
    | sdp steps            | does not exist                 |
    | sdp check            | does not exist                 |
    | sdp status           | does not exist                 |
    | sdp run              | contains "this step file ran"  |

Scenario: A malformed step expression stops the run in one line that names the definition; a reader gets an answer marked incomplete
  Given a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Given }) => {
      Given("a cart of {items}", () => {})
    })
    """
  When I run "sdp run"
  Then the exit code is 1
  And the output contains 'specs/steps/cart.steps.ts:4: invalid step expression "a cart of {items}": Undefined parameter type'
  And the output does not contain "    at "
  When I run "sdp context REQ-cart"
  Then the exit code is 2
  And the output contains "incomplete: this answer may miss something"
  And the output section "Scenarios" contains "undefined: Given an empty cart"
  And the output section "Step definitions" contains 'specs/steps/cart.steps.ts:4: invalid step expression "a cart of {items}"'

Scenario: --snippets prints one module for every undefined step, each expression once, And and But as the keyword before them
  Given a file "specs/REQ-wishlist.md" containing:
    """
    ---
    id: REQ-wishlist
    ---
    # Wishlist

    ```gherkin
    Scenario: Keep a lamp for later
      Given an empty cart
      When I add a lamp
      And I keep it for later
      Then the wishlist holds 1 item
      But the cart holds 1 item
    ```
    """
  And a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Given }) => {
      Given("an empty cart", () => {})
    })
    """
  When I run "sdp run --snippets"
  Then the output contains 'import { defineSteps, pending } from "sdp/steps"'
  And the output contains "export default defineSteps(newWorld, ({ When, Then }) => {"
  And the output contains '  When("I add a lamp", ({ world }) => pending())' 1 time
  And the output contains '  When("I keep it for later", ({ world }) => pending())'
  And the output contains '  Then("the wishlist holds {int} item", ({ world, args: [int] }) => pending())'
  And the output contains '  Then("the cart holds {int} item", ({ world, args: [int] }) => pending())' 1 time
  And the output contains "Existing step files: specs/steps/cart.steps.ts"
  And the output contains "step modules that pass the same factory share it"
~~~

### Runs

~~~gherkin
Scenario Outline: Records that no longer apply do not run
  Given a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: <status>
    ---
    # Release weekly

    ## Decision

    We release every Monday.

    ```gherkin
    Scenario: Releases are weekly
      Then the query "release" returns at least 52 results
    ```
    """
  When the workspace is run
  Then node "DEC-0001#releases-are-weekly" has attribute status = "<scenario>"

  Examples:
    | status     | scenario |
    | accepted   | failed   |
    | superseded | unrun    |
    | rejected   | unrun    |
    | deprecated | unrun    |

Scenario: A partial run keeps the results of everything else
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  And a file "specs/wishlist.feature" containing:
    """
    @id:REQ-wishlist
    Feature: Wishlist
      Scenario: Keep a lamp for later
        Then the query "#REQ-cart" returns 1 result
    """
  When the workspace is run
  And a file "specs/wishlist.feature" containing:
    """
    @id:REQ-wishlist
    Feature: Wishlist
      Scenario: Remember a lamp
        Then the query "#REQ-cart" returns 1 result
    """
  And the workspace is run for "REQ-wishlist"
  Then scenario "REQ-wishlist#remember-a-lamp" has status "passed"
  And scenario "REQ-cart#add-an-item" has status "passed"
  And scenario "REQ-wishlist#keep-a-lamp-for-later" has no result

Scenario: Two runs at once each record what they executed, and neither restores what the other replaced
  Given a file "specs/wishlist.feature" containing:
    """
    @id:REQ-wishlist
    Feature: Wishlist
      Scenario: Keep a lamp for later
        Given a wishlist
    """
  And a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that takes a moment
  And a step definition "the cart holds {int} item(s)" that passes
  And a step definition "a wishlist" that passes
  When the workspace is run
  And the step definition "a wishlist" now fails
  And the workspace is run for "REQ-cart" and for "REQ-wishlist" at the same time
  Then scenario "REQ-wishlist#keep-a-lamp-for-later" has status "failed"
  And scenario "REQ-cart#add-an-item" has status "passed"

Scenario: The results file holds one plain record per scenario, with what it ran against
  Given a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Step }) => {
      Step("an empty cart", () => {})
      Step("I add a lamp", () => {})
    })
    """
  When I run "sdp run"
  Then the file ".sdp/results.json" contains '"REQ-cart#add-an-item": {'
  And the file ".sdp/results.json" contains '"status": "undefined"'
  And the file ".sdp/results.json" contains '"hash": "'
  And the file ".sdp/results.json" contains '"sources": "'
  And the file ".sdp/results.json" contains '"toolchain": "'
  And the file ".sdp/results.json" contains '"inputs": "'
  And the file ".sdp/results.json" contains '"examples": ['
  And the file ".sdp/results.json" contains '"definition": "specs/steps/cart.steps.ts:4"'
  And the file ".sdp/results.json" contains '"snippet": "Then('

Scenario: A run that cannot get the lock on the results says which file is in its way
  Given a file ".sdp/results.json.lock" containing:
    """
    """
  When I run "sdp run"
  Then the exit code is 1
  And the output contains "another sdp run is recording results (.sdp/results.json.lock exists)"
  And the file ".sdp/results.json" does not exist

Scenario Outline: Progress is reported once per scenario and in order, whatever finishes first and however slow the reporter
  Given a file "specs/timing.feature" containing:
    """
    @id:REQ-timing
    Feature: Timing
      Scenario: One
        Given a first step

      Scenario: Two
        Given a step

      Scenario: Three
        Given a step
    """
  And a step definition "a step" that passes
  And a step definition "a first step" that <first step>
  When the workspace is run for "REQ-timing" with concurrency 3 and a reporter that takes a moment
  Then the reporter saw "start One, end One, start Two, end Two, start Three, end Three"

  Examples:
    | first step     |
    | passes         |
    | takes a moment |

Scenario: Scenarios run concurrently when asked to, except those tagged @serial
  Given a file "specs/timing.feature" containing:
    """
    @id:REQ-timing
    Feature: Timing
      Scenario: One
        Given a slow step

      Scenario: Two
        Given a slow step

      @serial
      Scenario: Alone
        Given a slow step
    """
  And a step definition "a slow step" that takes a moment
  When the workspace is run with concurrency 4
  Then the scenarios "One" and "Two" overlapped
  And the scenario "Alone" ran alone
  And scenario "REQ-timing#alone" has status "passed"

Scenario: --tags selects examples, and a scenario passes only when all its examples ran
  Given a file "specs/payment.feature" containing:
    """
    @id:REQ-payment
    Feature: Payment
      Scenario Outline: Pay by <method>
        Given a payment by <method>

        @fast
        Examples:
          | method |
          | card   |

        @slow
        Examples:
          | method  |
          | invoice |
    """
  And a step definition "a payment by card" that passes
  And a step definition "a payment by invoice" that fails
  When the workspace is run with tags "@fast"
  Then the step "a payment by card" has status "passed"
  And the step "a payment by invoice" did not run
  And scenario "REQ-payment#pay-by-method" has status "skipped"
  And node "REQ-payment" has attribute stage = "in-progress"

Scenario: Whether a scenario runs alone depends on the examples a run selects
  Given a file "specs/timing.feature" containing:
    """
    @id:REQ-timing
    Feature: Timing
      Scenario: One
        Given a slow step

      Scenario Outline: Two <mode>
        Given a slow step

        Examples:
          | mode     |
          | together |

        @serial
        Examples:
          | mode  |
          | alone |
    """
  And a step definition "a slow step" that takes a moment
  When the workspace is run with concurrency 4 and tags "not @serial"
  Then the scenarios "One" and "Two together" overlapped
~~~

### Gates

~~~gherkin
Rule: Gates run last

  Background:
    Given a file "docs/MS-beta.md" containing:
      """
      ---
      id: MS-beta
      kind: milestone
      ---
      # Beta

      ```gherkin
      Scenario: The cart works
        Then the node "REQ-cart" has stage "verified"
      ```
      """

  Scenario: A gate sees the results of the scenarios that ran before it
    Given a step definition "an empty cart" that passes
    And a step definition "I add a lamp" that passes
    And a step definition "the cart holds {int} item(s)" that passes
    When the workspace is run
    Then scenario "MS-beta#the-cart-works" has status "passed"

  Scenario: An unmet gate is reported like any other scenario
    When the workspace is run
    Then scenario "MS-beta#the-cart-works" has status "failed"

  Scenario: A gate's result goes stale when the results it read change
    Given a step definition "an empty cart" that passes
    And a step definition "I add a lamp" that passes
    And a step definition "the cart holds {int} item(s)" that passes
    When the workspace is run
    And the step definition "I add a lamp" now fails
    And the workspace is run for "REQ-cart"
    Then scenario "REQ-cart#add-an-item" has status "failed"
    And node "MS-beta#the-cart-works" has attribute status = "stale"
    And node "MS-beta#the-cart-works" has attribute staleBecause = "results-changed"

  Scenario: Whether a scenario is a gate depends on the examples a run selects
    Given a step definition "an empty cart" that passes
    And a step definition "I add a lamp" that passes
    And a step definition "the cart holds {int} item(s)" that passes
    And a file "specs/release.feature" containing:
      """
      @id:REQ-release
      Feature: Release
        Scenario Outline: The cart is <state>
          Then the node "REQ-cart" has <attribute> "<state>"

          Examples: As authored
            | attribute | state |
            | maturity  | ready |

          @gate
          Examples: After the ordinary scenarios
            | attribute | state    |
            | stage     | verified |
      """
    When the workspace is run with tags "not @gate"
    Then the step 'the node "REQ-cart" has maturity "ready"' has status "passed"
    And scenario "REQ-release#the-cart-is-state" has status "skipped"

  Scenario: An ordinary scenario sees the graph without results, whatever ran before
    Given a step definition "an empty cart" that passes
    And a step definition "I add a lamp" that passes
    And a step definition "the cart holds {int} item(s)" that passes
    And a file "specs/audit.feature" containing:
      """
      @id:REQ-audit
      Feature: Audit
        Scenario: Look at the graph
          Then the graph shows no results
      """
    And a step definition "the graph shows no results" that finds every scenario unrun
    When the workspace is run
    And the workspace is run
    Then scenario "REQ-cart#add-an-item" has status "passed"
    And scenario "REQ-audit#look-at-the-graph" has status "passed"

  Scenario Outline: An ordinary scenario that asserts on results is told to become a gate
    Given a file "specs/progress.feature" containing:
      """
      @id:REQ-progress
      Feature: Progress
        Scenario: Delivery state
          Then <step>
      """
    When the workspace is run
    Then the step '<step>' has status "failed"
    And the step '<step>' reports "a scenario that asserts on delivery state is a gate: tag it @gate or put it in a milestone"

    Examples:
      | step                                                        |
      | the query "requirement[stage=verified]" returns no results  |
      | the query "scenario[status=failed]" returns no results      |
      | the node "REQ-cart" has verification "passing"              |
      | the node "REQ-cart#add-an-item" has status "unrun"          |

  Scenario: A gate never sees the result of a gate, so none depends on another or on itself
    Given a file "docs/MS-alpha.md" containing:
      """
      ---
      id: MS-alpha
      kind: milestone
      ---
      # Alpha

      ```gherkin
      Scenario: Nothing fails
        Then the query "scenario[status=failed]" returns no results
      ```
      """
    When the workspace is run
    And the workspace is run
    Then scenario "MS-beta#the-cart-works" has status "failed"
    And scenario "MS-alpha#nothing-fails" has status "passed"
    And node "MS-alpha#nothing-fails" has attribute status = "passed"
~~~
