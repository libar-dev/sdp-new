@id=write-step-definitions
@realized-by:ARCH-runner @realized-by:ARCH-builtin-steps @realized-by:ARCH-spec-parser
Feature: Write step definitions

  Developers and agents who automate a spec want its scenarios to run as they are written: each
  step bound once to code in a step module, and every step that matches nothing, or more than one
  definition, pointed out with what to write. Teams that check the specifications themselves —
  architecture fitness functions, milestone gates, their own definition of done — want to write
  those checks as scenarios too, without code, so every run includes steps that assert on the graph.

  Not Cucumber's step API: no hooks and no custom parameter types. Nothing here decides what a run
  executes or what its results mean for a spec.

  Background:
    Given a file "specs/cart.feature" containing:
      """
      @id=cart
      Feature: Cart

        Shoppers collect items before paying.

        Rule: A cart holds what was added

          Scenario: Add an item
            Given an empty cart
            When I add a lamp
            Then the cart holds 1 item
      """

  Rule: What a handler returns or throws is its step's status

    Scenario Outline: Nothing, a Promise or an Effect, each passing or failing, and pending()
      Given a step definition "an empty cart" that <handler>
      When the workspace is run
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
      When the workspace is run
      Then the step "an empty cart" reports 'deliberate failure in "an empty cart"'

      Examples:
        | handler                                      |
        | throws an error                              |
        | returns a rejected Promise                   |
        | returns a failed Effect                      |
        | wraps a failing Promise in Effect.tryPromise |

  Rule: A handler gets typed arguments, a fresh world and a signal that asks it to stop

    Scenario Outline: Parameters are typed by the expression, and a regular expression passes on the text it captured
      Given a file "specs/pricing.feature" containing:
        """
        Feature: Pricing
          Scenario: Price a lamp
            Given <step>
        """
      And a step definition "<expression>" that records its arguments
      When the workspace is run
      Then the handler received the arguments <arguments>

      Examples:
        | step                  | expression                   | arguments      |
        | 3 lamps cost 19.5     | {int} lamps cost {float}     | [3, 19.5]      |
        | the lamp "Ada" is red | the lamp {string} is {word}  | ["Ada", "red"] |
        | a lamp for 2 rooms    | a lamp for {} rooms          | ["2"]          |
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
      When the workspace is run
      Then the handler received the doc string "Buy milk"
      And the handler received the table:
        | milk  | 1 |
        | bread | 2 |

    Scenario Outline: Every scenario gets a fresh world, shared by the modules on one world factory
      Given a file "specs/shop.feature" containing:
        """
        @id=shop
        Feature: Shop
          Rule: The cart counts each lamp added
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
      When the workspace is run
      Then node "shop#one-lamp" has attribute status = "<status>"
      And node "shop#two-lamps" has attribute status = "<status>"

      Examples:
        | checkout | status |
        | shop     | passed |
        | till     | failed |

    Scenario: A world factory that throws fails the step that needs the world
      Given the step definitions:
        | module | world    | expression    | behaviour |
        | cart   | throwing | an empty cart | passes    |
        | steps  | steps    | I add a lamp  | passes    |
      When the workspace is run
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "could not create the world of"
      And the step "an empty cart" reports "run.steps.ts: deliberate failure in the world factory"
      And the step "I add a lamp" has status "skipped"

    Scenario: A step that times out is told to stop through its signal
      Given a step definition "an empty cart" that waits for its signal
      When the workspace is run with a step timeout of 50 ms
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "step timed out"
      And the handler of "an empty cart" saw its signal abort

    Scenario: A step whose timeout is noticed only once it returns is told to stop too
      Given a step definition "an empty cart" that listens to its signal and keeps the thread busy for 200 ms
      When the workspace is run with a step timeout of 50 ms
      Then the step "an empty cart" reports "step timed out"
      And the handler of "an empty cart" saw its signal abort

    Scenario: Interrupting a run tells the running step to stop
      Given a step definition "an empty cart" that waits for its signal
      When the workspace is run and interrupted while "an empty cart" runs
      Then the handler of "an empty cart" saw its signal abort

  Rule: A step runs in sdp's own thread, and sees the global state the scenarios before it left

    Scenario: A scenario sees what one before it left in global state
      Given a file "specs/more.feature" containing:
        """
        @id=more
        Feature: More

          Rule: Another lamp joins the first

            Scenario: Add another
              When I add a lamp
              Then the cart holds 2 items
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const shared = globalThis as { lamps?: number }

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {
            shared.lamps = (shared.lamps ?? 0) + 1
          })
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (shared.lamps !== n) throw new Error(`the cart holds ${shared.lamps}`)
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "2 scenario(s): 2 passed"

  Rule: A step fails once it outlasts its timeout, and one that never yields, once it returns

    It runs in sdp's own thread, where code that never yields cannot be stopped.

    Scenario Outline: A step that outlasts its timeout fails, even one that never yields and so cannot be stopped
      Given a step definition "an empty cart" that <handler>
      When the workspace is run with a step timeout of 50 ms
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "step timed out"

      Examples:
        | handler                          |
        | takes a second                   |
        | keeps the thread busy for 200 ms |

  Rule: A step may take as long as the workspace's timeout says, 30 seconds unless it says otherwise, and --timeout overrides it

    Scenario Outline: The workspace's timeout says how long a step may take, and --timeout overrides it
      Given a file "sdp.config.yaml" containing:
        """
        <configuration>
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { setTimeout } from "node:timers/promises"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", ({ signal }) => setTimeout(1000, undefined, { signal }))
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item", () => {})
        })
        """
      When I run "sdp run <option>"
      Then the exit code is <exit code>
      And the output contains "<output>"

      Examples:
        | configuration              | option           | exit code | output                  |
        | # every key at its default | --timeout 50ms   | 1         | step timed out          |
        | timeout: 50ms              |                  | 1         | step timed out          |
        | timeout: 50ms              | --timeout '5 s'  | 0         | 1 scenario(s): 1 passed |

    Scenario: The configuration sdp init writes gives the timeout's default and what overrides it
      When I run "sdp init"
      Then the file "sdp.config.yaml" contains "# timeout: 30s"
      And the file "sdp.config.yaml" contains "sdp run --timeout and sdp gate --timeout override it"

  @maturity=idea @replaces:write-step-definitions#a-step-fails-once-it-outlasts-its-timeout-and-one-that-never
  Rule: A step that overruns its timeout is stopped, whether or not it yields

    An endless loop or a blocking call would otherwise hold the run for as long as it lasts.

  @maturity=idea @replaces:write-step-definitions#a-step-runs-in-sdp-s-own-thread-and-sees-the-global-state-the
  Rule: No scenario sees the global state another scenario left

  Rule: Every step is matched against every definition

    So one run reports everything that is missing or ambiguous, not only the first step that is.

    Scenario Outline: Every undefined step comes with a suggested definition
      When the workspace is run
      Then the step "<step>" has status "undefined"
      And the step "<step>" suggests the definition '<suggestion>'

      Examples:
        | step                  | suggestion                                                               |
        | an empty cart         | Given("an empty cart", ({ world }) => pending())                         |
        | I add a lamp          | When("I add a lamp", ({ world }) => pending())                           |
        | the cart holds 1 item | Then("the cart holds {int} item", ({ world, args: [int] }) => pending()) |

    Scenario: A step that matches more than one definition is ambiguous, which fails its spec
      Given a step definition "an empty cart" that passes
      And a step definition "an {word} cart" that passes
      When the workspace is run
      Then the step "an empty cart" has status "ambiguous"
      And node "cart#add-an-item" has attribute status = "ambiguous"
      And the step "an empty cart" reports "matches 2 definitions"
      And node "cart" has attribute stage = "failing"

    Scenario Outline: After a step that does not pass the rest are skipped but still matched, and the scenario takes the worst status
      Given a step definition "an empty cart" that <first step>
      And a step definition "I add a lamp" that passes
      When the workspace is run
      Then the step "an empty cart" has status "<status>"
      And the step "I add a lamp" has status "skipped"
      And the step "the cart holds 1 item" has status "undefined"
      And node "cart#add-an-item" has attribute status = "<scenario>"

      Examples: Worst first: failed, ambiguous, undefined, pending, skipped, passed
        | first step | status  | scenario  |
        | fails      | failed  | failed    |
        | pends      | pending | undefined |

    Scenario: --snippets prints one module for every undefined step, each expression once, And and But as the keyword before them
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Given an empty cart
              When I add a lamp
              And I keep it for later
              Then the wishlist holds 1 item
              But the cart holds 1 item
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "sdp run --snippets"
      Then the exit code is 1
      And the output contains 'import { defineSteps, pending } from "sdp/steps"'
      And the output contains "export default defineSteps(newWorld, ({ When, Then }) => {"
      And the output contains '  When("I add a lamp", ({ world }) => pending())' 1 time
      And the output contains '  When("I keep it for later", ({ world }) => pending())'
      And the output contains '  Then("the wishlist holds {int} item", ({ world, args: [int] }) => pending())'
      And the output contains '  Then("the cart holds {int} item", ({ world, args: [int] }) => pending())' 1 time
      And the output contains "Existing step files: specs/steps/cart.steps.ts"
      And the output contains "step modules that pass the same factory share it"

  Rule: A step module counts once, however many names and files export it

    Scenario: A module exported under two names, and again from another file, is one module
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export const steps = defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item", () => {})
        })
        export default steps
        """
      And a file "specs/steps/shop.steps.ts" containing:
        """
        export { steps } from "./cart.steps.ts"
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "1 scenario(s): 1 passed"
      When I run "sdp steps 'an empty cart' --json"
      Then the exit code is 0
      And the JSON output has:
        | complete  | true                      |
        | data.file | specs/steps/cart.steps.ts |

  Rule: steps lists the step definitions a run would know, built-in ones included, as file:line, keyword and expression

    It answers "is there a step for this already?" before a near-duplicate is written.

    Background:
      Given a file "specs/steps/search.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When }) => {
          Given("a catalogue with a desk lamp", () => {})
          When(/^a shopper searches for "(.*)"$/, () => {})
        })
        """

    Scenario: Every definition, one per line
      When I run "sdp steps"
      Then the output contains "specs/steps/search.steps.ts:4\tGiven\ta catalogue with a desk lamp"
      And the output contains 'specs/steps/search.steps.ts:5\tWhen\t/^a shopper searches for "(.*)"$/'
      And the output contains "\tThen\tthe query {string} returns no results"
      And the output contains "11 step definition(s)"

    Scenario Outline: steps <text> finds the definitions that mention the text or match it as a step
      When I run "sdp steps '<text>'"
      Then the output contains "<found>"
      And the output contains "1 step definition(s)"

      Examples:
        | text                             | found                           |
        | desk lamp                        | specs/steps/search.steps.ts:4   |
        | a shopper searches for \"lamp\"  | specs/steps/search.steps.ts:5   |
        | there are no warning diagnostics | there are no {word} diagnostics |

    Scenario: steps --json is the same list as data
      When I run "sdp steps catalogue --json"
      Then the JSON output has:
        | data.file       | specs/steps/search.steps.ts  |
        | data.line       | 4                            |
        | data.keyword    | Given                        |
        | data.expression | a catalogue with a desk lamp |

  Rule: A built-in step passes when the graph agrees, and otherwise says what it expected and what it found

    Every run includes them, so a rule about the specifications themselves is an ordinary scenario
    in the same format as every other, and needs no code.

    Background:
      Given these specs:
        | tags                                              | Feature |
        | @id=search @maturity=idea @realized-by:ARCH-index | Search  |
      And a file "src/index.ts" containing:
        """
        /** @sdp is ARCH-index */
        export const index = new Map<string, string>()
        """
      And a file "specs/inverted-index.feature" containing:
        """
        @id=inverted-index @kind=decision
        Feature: Use an inverted index

          Rule: The index is rebuilt every night
        """

    Scenario Outline: Each step, where the graph agrees
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "passed"

      Examples:
        | step                                                                                  |
        | the query "feature" returns 2 results                                                 |
        | the query "feature[maturity=draft]" returns no results                                |
        | the query "feature\|element" returns at least 2 results                               |
        | the query "element" returns at most 1 result                                          |
        | every node matching "feature[maturity=idea]" also matches "* ?-realized-by-> element" |
        | there are no error diagnostics                                                        |
        | there are no diagnostics for rule "dangling-link"                                     |
        | the node "search" has maturity "idea"                                                 |
        | the node "ARCH-index" has kind "element"                                              |

    Scenario Outline: Each step, where the graph differs
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports '<reason>'

      Examples:
        | step                                                     | reason                                                         |
        | the query "feature" returns 3 results                    | returned 2 result(s), expected 3                               |
        | the query "feature" returns no results                   | search (feature) specs/search.feature:1                        |
        | the query "element" returns at least 2 results           | returned 1 result(s), expected at least 2                      |
        | the query "feature\|element" returns at most 1 result    | returned 3 result(s), expected at most 1                       |
        | every node matching "element" also matches "*[maturity]" | ARCH-index (element) src/index.ts:1                            |
        | there are no warning diagnostics                         | [decision-shape] inverted-index                                |
        | there are no diagnostics for rule "decision-shape"       | inverted-index has a rule ("The index is rebuilt every night") |
        | the node "search" has maturity "ready"                   | search.maturity is "idea", expected "ready"                    |

    Scenario: A query result is compared with a table of ids, in any order, with or without a header
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Exactly these
            Then the query "feature|element" returns:
              | id         |
              | search     |
              | ARCH-index |
              | cart       |

          Scenario: Not these
            Then the query "feature" returns:
              | search     |
              | ARCH-index |
        """
      When the workspace is run
      Then the step 'the query "feature|element" returns:' has status "passed"
      And the step 'the query "feature" returns:' has status "failed"
      And the step 'the query "feature" returns:' reports "returned [cart, search], expected [ARCH-index, search]"

  Rule: A built-in step fails when its answer cannot be trusted

    "There is none" is the easiest thing to prove by accident. `sdp q` only notes what a step fails
    on: exploring is not asserting.

    Background:
      Given these specs:
        | tags                                              | Feature |
        | @id=search @maturity=idea @realized-by:ARCH-index | Search  |

    Scenario Outline: A query that does not parse, or names what nothing in the workspace has, fails with the closest known word
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports '<reason>'

      Examples:
        | step                                                                 | reason                                              |
        | the query "feature[" returns no results                              | invalid query                                       |
        | the query "feture" returns no results                                | no kind feture; closest: feature                    |
        | the query "* -realised-by-> *" returns no results                    | no relation realised-by; closest: realized-by       |
        | the query "#serach[maturity=ready]" returns no results               | no node has the id serach; closest: search          |
        | the query "feature[maturty=ready]" returns no results                | feature has no attribute maturty; closest: maturity |
        | the query "#search -realized-by-> *[ownr]" returns no results        | * has no attribute ownr                             |
        | every node matching "#serach" also matches "feature[maturity=ready]" | no node has the id serach                           |
        | the node "lost" has maturity "ready"                                 | no node lost                                        |
        | the node "search" has maturty "undefined"                            | search has no attribute maturty; closest: maturity  |
        | there are no eror diagnostics                                        | unknown severity "eror"                             |
        | there are no constructor diagnostics                                 | unknown severity "constructor"                      |
        | there are no diagnostics for rule "decision-stats"                   | unknown rule "decision-stats"                       |

    Scenario: A tag compared without its @ is told how a tag is written, and not to declare a word
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then the query "feature[tags=web]" returns no results
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "no tag web; a tag is written with its @, as @web"
      And the output does not contain "vocabulary.words"

    Scenario Outline: A word the vocabulary declares, or a kind an id prefix names, can be asserted absent
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary:
          words: { kinds: [incident], relations: [leaks-to], attributes: [exposure] }
        ids: { runbook: RB }
        """
      And a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "<status>"

      Examples:
        | step                                                   | status |
        | the query "* -leaks-to-> *" returns no results         | passed |
        | the query "incident[!owner]" returns no results        | failed |
        | the query "incident" returns no results                | passed |
        | the query "feature[exposure=high]" returns no results  | passed |
        | the query "runbook[maturity=ready]" returns no results | passed |
        | the query "* -leaks-into-> *" returns no results       | failed |

    Scenario: A graph that could not be fully read proves nothing, so a query step fails
      Given a file "src/search.ts" containing:
        """
        // @sdp implements search

        export const search = ( => []
        """
      And a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then the query "code -implements-> #search" returns no results
        """
      When the workspace is run
      Then the step 'the query "code -implements-> #search" returns no results' has status "failed"
      And the step 'the query "code -implements-> #search" returns no results' reports "src/search.ts:3 [annotation-unreadable]"

    Scenario Outline: A query cut short by a limit proves nothing, so the step fails
      Given a chain of 14 nodes linked by "next"
      And 25 nodes, each linked to all the others by "knows"
      And a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports 'was cut short (<limit>), so its result is incomplete'

      Examples:
        | step                                                                               | limit                                 |
        | the query "#N1 -next+-> #N14" returns no results                                   | a + edge reaches further than 12 hops |
        | the query "#N1 -next+-> *" returns at least 12 results                             | a + edge reaches further than 12 hops |
        | the query "#N1 !-next+-> #N14" returns 1 result                                    | a + edge reaches further than 12 hops |
        | the query "member -knows-> member -knows-> member" returns at most 25 results      | a step has more than 10000 paths      |
        | every node matching "member -knows-> member -knows-> member" also matches "member" | a step has more than 10000 paths      |

  Rule: Only a run imports step modules; every other command reads them as text, and says what it could not read

    Asking must be safe: reading a workspace runs none of its code, and only a run is asked to.

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
      Then the exit code is <exit>
      And the file "executed.txt" <is there or not>

      Examples:
        | command               | exit | is there or not               |
        | sdp context cart      | 0    | does not exist                |
        | sdp steps             | 0    | does not exist                |
        | sdp check --base none | 0    | does not exist                |
        | sdp status            | 0    | does not exist                |
        | sdp run               | 1    | contains "this step file ran" |

    Scenario: A step definition is read whether its registrar is destructured, renamed or taken whole, and it matches by text, whatever keyword registered it
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given: given, Then }) => {
          given("an empty cart", () => {})
          Then(`I add a lamp`, () => {})
        })
        """
      And a file "specs/steps/more.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), (steps) => {
          steps.Step(/^the cart holds [0-9]+ items?$/, () => {})
        })
        """
      When I run "sdp steps cart"
      Then the exit code is 0
      And the output contains "specs/steps/cart.steps.ts:4\tGiven\tan empty cart"
      And the output contains "specs/steps/more.steps.ts:4\tStep\t/^the cart holds [0-9]+ items?$/"
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

    Scenario: A step registered other than by a statement of its own is reported, never guessed
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When, Then }) => {
          Given("an empty cart", () => {
            const When = (text: string) => text
            When("a phantom step")
          })
          if (process.env.NO_LAMPS === undefined) When("I add a lamp", () => {})
          const outcome = Then
          outcome("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp steps cart"
      Then the exit code is 2
      And the output contains "specs/steps/cart.steps.ts:4\tGiven\tan empty cart"
      And the output contains "1 step definition(s)"
      And the output contains "not read: specs/steps/cart.steps.ts:8: this statement registers steps under a condition, in a loop or through another name"
      And the output contains "not read: specs/steps/cart.steps.ts:9:"
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

    Scenario: A module not exported, a registration after a return, defineSteps renamed and a module a function makes are reported, never listed
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const unused = defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      And a file "specs/steps/lamp.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ When }) => {
          When("I add a lamp", () => {})
          if (process.env.NO_LAMPS === undefined) return
          When("I add a phantom", () => {})
        })
        """
      And a file "specs/steps/count.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the cart holds {int} item(s)", () => {})
        })
        const define = defineSteps
        export const hidden = define(() => ({}), ({ Then }) => {
          Then("a hidden step", () => {})
        })
        """
      And a file "specs/steps/made.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const make = () =>
          defineSteps(() => ({}), ({ Then }) => {
            Then("a made step", () => {})
          })
        export const made = make()
        """
      When I run "sdp steps"
      Then the exit code is 2
      And the output contains "specs/steps/count.steps.ts:4\tThen\tthe cart holds {int} item(s)"
      And the output contains "specs/steps/lamp.steps.ts:4\tWhen\tI add a lamp"
      And the output contains "11 step definition(s)"
      And the output contains "not read: specs/steps/cart.steps.ts:3: this defineSteps(…) is not exported, so a run loads none of its steps"
      And the output contains "not read: specs/steps/lamp.steps.ts:5: this statement may return before the registrations after it"
      And the output contains "not read: specs/steps/count.steps.ts:6: defineSteps is renamed or passed on here"
      And the output contains "not read: specs/steps/made.steps.ts:7: this export is what a call returns"
      When I run "sdp run --json"
      Then the exit code is 1
      And the JSON output has:
        | data.summary.undefined | 1 |

    Scenario: A file that exports again another step file's module, and a module of its own that cannot be read, is reported
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
        })
        """
      And a file "specs/steps/shop.steps.ts" containing:
        """
        import * as steps from "sdp/steps"

        export { default as cart } from "./cart.steps.ts"
        const own = steps.defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        export default { ...own }
        """
      When I run "sdp steps 'an empty cart'"
      Then the exit code is 2
      And the output contains "not read: specs/steps/shop.steps.ts:1: no defineSteps(…) call at the top level of this step file"
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "matches 2 definitions"

    Scenario Outline: A path the steps globs match that is no file is reported as not read: <what>
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
        })
        """
      When I run "<made by>"
      Then the exit code is 0
      When I run "sdp steps 'an empty cart' --json"
      Then the exit code is 2
      And the JSON output has:
        | complete  | false                     |
        | data.file | specs/steps/cart.steps.ts |
      And the output contains "not read: specs/steps/<file>:1 [not-a-file]"

      Examples:
        | what              | made by                                    | file          |
        | a link to nothing | ln -s nowhere.ts specs/steps/gone.steps.ts | gone.steps.ts |
        | a named pipe      | mkfifo specs/steps/pipe.steps.ts           | pipe.steps.ts |

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
      When I run "sdp context cart"
      Then the exit code is 2
      And the output contains "incomplete: this answer may miss something"
      And the output section "Contract" contains "undefined: Given an empty cart"
      And the output section "Step definitions" contains 'specs/steps/cart.steps.ts:4: invalid step expression "a cart of {items}"'

  Rule: Step modules, and the code they test, import sdp without installing it

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
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

    Scenario: Application code under test imports sdp without installing it
      Given a file "src/cart.ts" containing:
        """
        import { isAppError } from "sdp"

        export const lamp = (): number => (isAppError(undefined) ? 0 : 1)
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
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

  @maturity=idea
  Rule: A step definition can be scoped to an area, so that two areas say the same words and mean steps of their own

    Each bounded context of a large codebase speaks its own language, and one registry for all of them
    makes the same words ambiguous.

  @open @maturity=idea
  Rule: Is a step matched only by a definition of its own kind — Given, When or Then — though every step is matched against every definition today?

  @maturity=idea
  Rule: A step module defines parameter types of its own, such as an id, and steps lists them

  @maturity=idea
  Rule: A step module says what runs after each scenario, passed or failed, to clean up what its steps made
