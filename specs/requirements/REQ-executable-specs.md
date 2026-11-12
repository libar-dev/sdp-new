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
  decided-by: [DEC-0005, DEC-0001]
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
import { defineSteps, pending } from "sdp"

export default defineSteps(() => ({ cart: [] as Array<string> }), ({ Given, When, Then }) => {
  Given("a cart with {int} items", ({ world, args: [n] }) => { world.cart = Array(n).fill("item") })
  When("the guest checks out with a valid card", () => pending("payment sandbox not wired yet"))
  Then("an order is created", ({ world }) => Effect.sync(() => { /* assert */ }))
})
```

- **Parameters are typed by the expression**: `{int}` and `{float}` arrive as numbers; `{string}`
  (in `"` or `'` quotes), `{word}` and `{}` as strings. Regular expressions work too. A step's doc
  string arrives as `doc`, its data table as `table` (rows of cells).
- **Handlers** return nothing, a Promise or an Effect. A thrown error, a rejected Promise or a failed
  Effect fails the step; `pending(reason)`, returned or thrown, marks it recognised but not
  implemented. A step times out after 30 seconds.
- **Stopping.** The context carries `signal`, an `AbortSignal` that aborts when the step times out
  or the run is interrupted. An Effect is interrupted either way; a Promise keeps running unless
  its handler passes the signal on — to `fetch`, a child process, a timer.
- **Worlds.** The first argument of `defineSteps` is a world factory. Every scenario gets a fresh
  world per factory; modules passing the same factory share that world, so a step library can be
  split across files (sdp's own steps share `specs/steps/world.ts`). A world is made as part of the
  first step that needs it: a factory that throws fails that step, naming the module.
- Steps match by text, not keyword: `Given`, `When`, `Then` and `Step` register alike.
- **`import … from "sdp"`** — and `"sdp/annotations"` in the application code the steps exercise —
  always resolve to the sdp that runs the steps, so a workspace needs no package installed for it,
  and step modules and runner never disagree about versions.
- A step file must export its module (`export default defineSteps(…)`); one that exports none is
  reported as a warning, and one that fails to load stops the run with one line naming the file
  ([[REQ-cli]]).

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
against the current step definitions and list those without exactly one ([[REQ-agent-context]]).
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
| anything else: some pending, or some passed while others are not | `pending` | `in-progress` |

`sdp run` records results in `.sdp/results.json` (the `results` setting): per scenario its status,
each example's steps with their status, error, matching definition (`file:line`), suggested
definition and duration, a hash of the scenario's executable content, and its `evidence`. Every
command reads the file: scenario nodes get `status`, `lastRun` and, when stale, `staleBecause`;
specs their `verification` and `stage`. A partial run (`sdp run <ids or paths>`, `--tags`) merges into the earlier results and
drops results of scenarios that no longer exist. The file is generated; never edit it by hand.

A result counts only while what it ran against is unchanged. Its evidence is a fingerprint of the
configuration file, the code (the `code` globs), the step definition files (the `steps` globs) and
the workspace files they import. A scenario whose steps read the graph — the built-in steps, and
any step definition that uses `project` — also records the spec and feature files; a gate that
reads the graph also records the statuses of the ordinary scenarios that ran before it. When any
of that changes, the result is **stale**: kept, but no longer counted. The scenario node's `status`
is `stale`, and `staleBecause` says what changed:

| `staleBecause` | What changed since the run |
| --- | --- |
| `scenario-changed` | the scenario itself |
| `code-changed` | the configuration, a code file, a step definition file or a file it imports — one added or removed too |
| `specs-changed` | a spec or feature file, and the scenario read the graph |
| `results-changed` | the status of an ordinary scenario, and the gate read the graph |

A spec whose scenarios are all stale is back at its declared maturity, so nothing stays `verified`
on evidence about other code, and a gate that requires verified work is unmet until the scenarios
run again. Invalidation is deliberately coarse — any change to the code invalidates every result —
and covers what step definitions import, not files they read while running. `sdp status` counts
stale results by reason; `sdp run` says how many earlier results it left stale — those it did not
select.

## Runs need readable specs

A run that cannot read every scenario does not start. When Gherkin or front matter does not parse
(`gherkin-syntax`, `front-matter`) or an id is declared twice (`duplicate-id`, so results could be
filed under the wrong scenario), `sdp run` and `sdp gate` list those errors, one line each with
`file:line`, and exit with 1 before anything executes or is recorded ([[REQ-cli]]). Other errors
`sdp check` reports, such as a dangling link, leave every scenario readable and do not stop a run;
neither do undefined steps, which are specifications not automated yet.

## Gates and records that no longer apply

`sdp run` executes ordinary scenarios first and **gate scenarios** second — scenarios of milestones
(`kind: milestone`) and scenarios tagged `@gate` — against a graph rebuilt with the fresh results,
so a gate can require what the run just verified; with `--tags`, a scenario is a gate when a
selected example is tagged `@gate`. Gates assert against the graph with built-in steps
([[REQ-builtin-steps]]). An unmet gate is reported but does not fail `sdp run`, because a future
milestone is expected to be unmet; `sdp gate <milestone>` ([[REQ-cli]]) evaluates one milestone
and exits with 1 while it is unmet. A failed or ambiguous ordinary scenario does fail `sdp run`.

Specs whose `status` is `superseded`, `rejected` or `deprecated` keep their text but do not run: a
decision that no longer applies stops guarding anything.

## Running concurrently

`sdp run --concurrency <n>` runs up to `n` scenarios at once, which pays off when steps wait on
processes, files or networks. Scenarios tagged `@serial` — timing measurements, anything sharing a
resource — always run alone, after the others; with `--tags`, those with a selected example tagged
`@serial`. Results are reported in scenario order whatever finishes first, so output stays stable.
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
    | pends  | pending  | pending      | in-progress |
    | fails  | failed   | failing      | failing     |

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

Scenario Outline: A result counts only while the sources it ran against are unchanged
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  And a file "<file>" containing:
    """
    <content>
    """
  Then node "REQ-cart#add-an-item" has attribute status = "stale"
  And node "REQ-cart#add-an-item" has attribute staleBecause = "code-changed"
  And node "REQ-cart" has attribute stage = "ready"

  Examples:
    | file                      | content                       |
    | src/cart.ts               | export const lamps = 1        |
    | sdp.config.yaml           | results: .sdp/results.json    |
    | specs/steps/cart.steps.ts | export const phrases = []     |

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
    import { defineSteps } from "sdp"
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

Scenario Outline: Parameters are typed by the expression
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
    import { defineSteps } from "sdp"

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
    import { defineSteps } from "sdp"
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
    import { defineSteps } from "sdp"

    export default defineSteps(() => ({}), ({ Given }) => {
      Given("an empty cart", () => {})
    })
    """
  When I run "sdp run --snippets"
  Then the output contains 'import { defineSteps, pending } from "sdp"'
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
        Scenario Outline: The cart is <stage>
          Then the node "REQ-cart" has stage "<stage>"

          Examples: Before this run
            | stage |
            | ready |

          @gate
          Examples: After the ordinary scenarios
            | stage    |
            | verified |
      """
    When the workspace is run with tags "not @gate"
    Then the step 'the node "REQ-cart" has stage "ready"' has status "passed"
    And scenario "REQ-release#the-cart-is-stage" has status "skipped"
~~~
