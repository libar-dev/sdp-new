@id=configure-a-workspace
@realized-by:ARCH-workspace @realized-by:ARCH-vocabulary
Feature: Configure a workspace

  A team that adopts sdp brings its own repository layout and its own words: user stories rather
  than requirements, ADRs rather than decisions, sprints rather than iterations. sdp works in any
  repository before anyone configures it; a team that does writes one file at the root of the
  workspace, `sdp.config.yaml` (or `.yml`, or `.json`), that says where specs, code and step
  definitions are, how ids are prefixed, and which of its words play the few roles sdp interprets.

  Not a schema for specs: kinds, relations and attributes are whatever authors write, and only the
  words sdp reads meaning into are configured.

  Rule: A key left out keeps its default; a list or value written replaces it and exclude adds to it, while ids and vocabulary change only the entries they name

    The defaults find specs and code where most repositories keep them, so an empty file or none at
    all is a configuration that works. A team names only the prefixes and roles it calls by words of
    its own, and keeps sdp's for the rest.

    Scenario Outline: Each key, in YAML or JSON
      Given these specs:
        | tags                      | Feature |
        | @id=login @maturity=ready | Login   |
      And a file "notes/scratch.feature" containing:
        """
        @id=scratch @maturity=idea
        Feature: Scratch
        """
      And a file "node_modules/kit/vendored.feature" containing:
        """
        @id=vendored @maturity=idea
        Feature: Vendored
        """
      And a file "src/orders.ts" containing:
        """
        // @sdp implements login
        export function order() {}
        """
      And a file "tools/report.ts" containing:
        """
        // @sdp implements login
        export function report() {}
        """
      And a file "<file>" containing:
        """
        <config>
        """
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | key             | file            | config                                                                                | query                       | result                                   |
        | none            | sdp.config.yaml |                                                                                       | feature\|code               | login, scratch, code:src/orders.ts#order |
        | features        | sdp.config.yaml | features: ["specs/**/*.feature"]                                                      | feature                     | login                                    |
        | code            | sdp.config.yaml | code: ["tools/**/*.ts"]                                                               | code                        | code:tools/report.ts#report              |
        | exclude         | sdp.config.yaml | exclude: ["notes/**"]                                                                 | feature                     | login                                    |
        | ids             | sdp.config.yaml | ids: { nfr: QR }                                                                      | feature                     | login, scratch                           |
        | vocabulary      | sdp.config.yaml | vocabulary: { maturity: [idea, approved, ready] }                                     | feature[maturity<approved]  | scratch                                  |
        | vocabulary role | sdp.config.yaml | vocabulary: { kinds: { decision: [adr] } }                                            | feature[maturity<specified] | scratch                                  |
        | json            | sdp.config.json | { "exclude": ["notes/**"] }                                                           | feature                     | login                                    |
        | yml             | sdp.config.yml  | exclude: ["notes/**"]                                                                 | feature                     | login                                    |

    Scenario: Step modules only where steps says, and results where results says
      Given a file "sdp.config.yaml" containing:
        """
        steps: ["acceptance/steps/*.ts"]
        results: out/results.json
        """
      And a file "acceptance/steps/cart.ts" containing:
        """
        export default {}
        """
      And a file "specs/legacy.steps.ts" containing:
        """
        export default {}
        """
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart starts empty

            Scenario: A new cart is empty
              Then the cart is empty
        """
      And a step definition "the cart is empty" that passes
      Then sdp run loads the step modules "acceptance/steps/cart.ts"
      When the workspace is run
      Then the file "out/results.json" contains '"cart#a-new-cart-is-empty"'
      And node "cart" has attribute stage = "verified"

    Scenario: Step modules where a steps glob written as an absolute path says
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart starts empty

            Scenario: A new cart is empty
              Then the cart is empty
        """
      And a file "acceptance/steps/cart.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the cart is empty", () => {})
        })
        """
      When I run "sh -c 'echo steps: [$PWD/acceptance/steps/*.ts] > sdp.config.yaml'"
      Then the exit code is 0
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "1 scenario(s): 1 passed"

  Rule: An id's prefix says its kind as it is configured, before - or _, and an id with no prefix sdp knows is a feature; ids adds prefixes or renames them

    So an id says what it is wherever it is cited, and a team's own prefixes name the specs sdp new
    writes. Most specs are features, and a feature is named by what it says, so its id needs no
    prefix. A prefix in another case is a word: an IT asset inventory is no iteration.

    Scenario Outline: The default prefixes of specs, and two that are none
      Given these specs:
        | tags     | Feature |
        | @id=<id> | Spec    |
      Then node "<id>" has attribute kind = "<kind>"

      Examples:
        | id              | kind      |
        | MS-launch       | milestone |
        | PH-construction | phase     |
        | IT-beta         | iteration |
        | TODO-1          | feature   |
        | checkout        | feature   |

    Scenario Outline: The default prefixes of the architecture, named by work still to come
      Given these specs:
        | tags                                        | Feature |
        | @id=search @maturity=idea @realized-by:<id> | Search  |
      Then node "<id>" has attribute kind = "<kind>"

      Examples:
        | id          | kind    |
        | ARCH-orders | element |
        | PAT-outbox  | pattern |
        | ARCH_orders | element |

    Scenario Outline: A word that begins like a prefix in another case
      Given these specs:
        | tags     | Feature |
        | @id=<id> | Spec    |
      Then node "<id>" has attribute kind = "feature"

      Examples:
        | id                   |
        | it-asset-inventory   |
        | ms-teams-integration |
        | arch_orders          |

    Scenario: A link to no node whose id begins like a prefix in another case is told the prefix after what the link may mean
      Given these specs:
        | tags                                                                  | Feature |
        | @id=pay @maturity=idea @depends-on:ms-office-import @iteration:it_one | Pay     |
      When the workspace is checked
      Then sdp reports:
        | rule          | at                  | message                            | hint                                                                                                                                                                                         |
        | dangling-link | specs/pay.feature:1 | pay -depends-on-> ms-office-import | write the spec `@id=ms-office-import` (`sdp new <kind> "<title>" --id ms-office-import`), or fix the reference; the prefix of kind milestone is `MS-`, written as configured: `MS-office-import` |
        | dangling-link | specs/pay.feature:1 | pay -iteration-> it_one            | the prefix of kind iteration is `IT_`, written as configured: `IT_one`                                                                                                                       |

    Scenario: A prefix of the team's own, beside the defaults
      Given a file "sdp.config.yaml" containing:
        """
        ids: { requirement: US }
        """
      And these specs:
        | tags          | Feature |
        | @id=US-signup | Sign-up |
        | @id=login     | Login   |
      When I query "requirement"
      Then the result is "US-signup"
      And a new requirement titled "Guest checkout" gets the id "US-guest-checkout"
      And a new element titled "Orders" gets the id "ARCH-orders"

  @decided-by:free-vocabulary
  Rule: The vocabulary says which of the team's words play the roles sdp interprets, and every command reads them

    A team keeps its own words, and sdp still knows which nodes are its features, which are the
    architecture and what shapes it, which are decisions and milestones, and which links plan work
    into iterations.

    Scenario: A component plays the role of the architecture, an ADR that of a decision, and a risk that of a driver
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { architectural: [component], decision: [adr], driver: [adr, nfr, risk] } }
        """
      And these specs:
        | tags                                                                                           | Feature                 |
        | @id=checkout @maturity=idea @realized-by:orders @decided-by:use-postgres @threatened-by:outage | Checkout                |
        | @id=billing @kind=component                                                                    | Billing                 |
        | @id=ARCH-legacy                                                                                | Legacy                  |
        | @id=outage @kind=risk                                                                          | Payment provider outage |
      And a file "src/orders.ts" containing:
        """
        /** @sdp is orders kind=component */
        export const place = (): number => 0
        """
      And a file "specs/use-postgres.feature" containing:
        """
        @id=use-postgres @kind=adr
        Feature: Use Postgres

          Rule: Every table has a primary key
        """
      When I ask for the architecture view
      Then the output contains "use-postgres, through checkout"
      And the output contains "outage, through checkout"
      And the output does not contain "ARCH-legacy"
      When the workspace is checked
      Then sdp reports at least:
        | rule             | node         |
        | decision-shape   | use-postgres |
        | declared-in-spec | billing      |

    Scenario: A sprint plans work, part-of puts it in its phase, and a runbook is work of operations
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { relations: { plan: [sprint], phase: [part-of] }, disciplines: { operations: [runbook] } }
        """
      And these specs:
        | tags                                             | Feature             |
        | @id=PH-build                                     | Build               |
        | @id=S1 @kind=iteration @part-of:PH-build         | S1                  |
        | @id=S2 @kind=iteration @phase:PH-build           | S2                  |
        | @id=search @maturity=idea @sprint:S1             | Search              |
        | @id=filters @maturity=idea @iteration:S1         | Filters             |
        | @id=restore-from-backup @kind=runbook @sprint:S1 | Restore from backup |
      When the lifecycle is computed
      Then the iterations are:
        | id | phase    | plans                       |
        | S1 | PH-build | restore-from-backup, search |
        | S2 |          |                             |
      And the planned activity is:
        | discipline   | S1 |
        | requirements | 1  |
        | operations   | 1  |

    Scenario: Features called req are requirements work: new writes them at a maturity, and an iteration plans them
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { feature: [req] } }
        """
      And these specs:
        | tags                                         | Feature |
        | @id=IT-one @start=2026-11-02 @end=2026-11-13 | One     |
        | @id=search @maturity=idea @iteration:IT-one  | Search  |
      When I run "sdp new req 'Saved carts'"
      Then the exit code is 0
      And the file "specs/features/saved-carts.feature" contains "@id=saved-carts @maturity=idea"
      When I run "sdp check --base none"
      Then the exit code is 0
      And the output contains "0 error(s), 0 warning(s)"
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.disciplines.requirements | 1           |
        | data.unplanned                | saved-carts |

    Scenario: A milestone recorded as reached
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { attributes: { met: reached } }
        """
      And a file "specs/MS-launch.feature" containing:
        """
        @id=MS-launch
        Feature: Launch

          Rule: Launch is planned

            Scenario: There is a milestone
              Then the query "milestone" returns 1 result
        """
      When I run "sdp gate MS-launch --record"
      Then the file "specs/MS-launch.feature" contains "@id=MS-launch @reached=20"
      When I run "sdp status"
      Then the output contains "milestones    met 1"

    Scenario: sdp new writes what a renamed profile reads
      Given a file "sdp.config.yaml" containing:
        """
        ids: { adr: ADR, era: ERA }
        vocabulary:
          kinds: { feature: [story], decision: [adr], milestone: [checkpoint], phase: [era], iteration: [sprint], driver: [adr, nfr] }
          relations: { plan: [sprint], phase: [part-of], closes: [ends], anchor: implements-element }
          attributes: { start: from, end: until }
        """
      When I run "sdp new adr 'Use Postgres'"
      Then the output contains "ADR-use-postgres\tspecs/decisions/ADR-use-postgres.feature"
      And the file "specs/decisions/ADR-use-postgres.feature" does not contain "@kind="
      When I run the pipeline:
        """
        sdp new era Elaboration
        sdp new sprint Baseline --id IT-baseline
        sdp new checkpoint Launch
        sdp new story Wishlist
        """
      Then the exit code is 0
      And the file "specs/plan/IT-baseline.feature" contains "@id=IT-baseline @kind=sprint @part-of:ERA-elaboration @from=2026"
      And the file "specs/plan/launch.feature" contains "@id=launch @kind=checkpoint"
      And the output contains "next: set `@ends:` to the phase or the iteration this milestone ends"
      And the file "specs/features/wishlist.feature" contains "@id=wishlist @maturity=idea"
      When I run "sdp q 'era <-part-of- sprint' --ids"
      Then the output lines are "IT-baseline"
      When I run "sdp check --json --base none"
      Then the exit code is 0
      And the JSON output has:
        | data.rule | plan-reference, template-placeholder |
      And the output contains "set `@ends:` to the phase or iteration it ends"

  @decided-by:free-vocabulary
  Rule: A ladder of the team's own orders the maturities of work still to come, and a value off it ranks below every rung

    sdp reads no meaning into a rung: any maturity says that the work is still to come, and the
    ladder is the order in which a query compares maturities and stages. A value off the ladder is
    below every rung, so a question for what has not come far enough finds it.

    Scenario: A ladder of sketch, agreed and estimated
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [sketch, agreed, estimated] }
        """
      And these specs:
        | tags                            | Feature  |
        | @id=cart                        | Cart     |
        | @id=wishlist @maturity=agreed   | Wishlist |
        | @id=returns @maturity=estimated | Returns  |
        | @id=gifts @maturity=someday     | Gifts    |
      When I query "feature[maturity<estimated]"
      Then the result is "gifts, wishlist"
      When I query "feature[toCome]"
      Then the result is "gifts, returns, wishlist"
      When I run "sdp vocabulary"
      Then the output line with "maturity" contains "sketch, agreed, estimated"

    Scenario Outline: A ladder of <ladder>, whose last rung is still to come
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [<ladder>] }
        """
      And these specs:
        | tags                      | Feature |
        | @id=cart @maturity=<last> | Cart    |
      When the workspace is checked
      Then sdp reports nothing
      And node "cart" has attribute toCome = "true"

      Examples:
        | ladder                       | last     |
        | proposed, accepted, complete | complete |
        | Idee, Entwurf, Fertig        | Fertig   |

  Rule: sdp vocabulary prints the words sdp interprets as a configuration that reads back, and the words it makes itself, which nothing configures

    A team sees which of its words sdp reads meaning into, and starts its own profile from the one
    in force.

    Scenario: A team's word for decisions, the defaults, and the words sdp makes itself
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { decision: [adr] } }
        """
      When I run "sdp vocabulary --json"
      Then the JSON output has:
        | data.vocabulary.kinds.decision              | adr                                                                                                  |
        | data.vocabulary.maturity                    | idea, draft, specified, ready                                                                        |
        | data.vocabulary.kinds.driver                | decision                                                                                             |
        | data.vocabulary.disciplines.requirements    | feature                                                                                              |
        | data.vocabulary.disciplines.deployment      | environment                                                                                          |
        | data.vocabulary.disciplines.analysis-design | element, pattern, architecture                                                                       |
        | data.made.kinds                             | scenario, rule, code, missing                                                                        |
        | data.made.relations                         | rule-of, imports                                                                                     |
        | data.made.tags                              | @gate, @serial, @open, @quality                                                                      |
        | data.made.stages                            | unrun, failing, in-progress, verified                                                                |
        | data.made.retiredKinds                      | change                                                                                               |
        | data.made.attributes                        | stage, scenarios, summary, file, tags, openQuestions, toCome, rulesToCome                            |
        | data.made.scenarioAttributes                | spec, keyword, tags, description, rule, steps, examples, status, staleBecause, lastRun, hash, toCome |
        | data.made.ruleAttributes                    | spec, description, tags, scenarios, stage, toCome                                                    |
        | data.made.codeAttributes                    | file, symbol, doc, shape, exports                                                                    |
        | data.made.reservedRelations                 | stage, scenarios, summary, file, tags, openQuestions, toCome, rulesToCome, maturity, status          |
      When I run "sdp vocabulary"
      Then the output line with "decision" contains "adr"
      And the output line with "stages" contains "unrun, failing, in-progress, verified"

    Scenario: Printed, copied and read again
      When I run the pipeline:
        """
        sdp vocabulary --json | jq '{ vocabulary: .data.vocabulary }' > copied.json
        mv copied.json sdp.config.json
        sdp vocabulary --json | jq -r '.data.vocabulary.relations.plan[]'
        """
      Then the exit code is 0
      And the output lines are "iteration"

  Rule: sdp vocabulary prints the type of each word that joins two nodes or takes a value, in the workspace's words

    An agent that links a feature reads what it may link to before it writes the tag, and check
    holds the link to the same type.

    Scenario: A team's word for decisions in the types
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { decision: [adr] } }
        """
      When I run "sdp vocabulary --json"
      Then the JSON output has:
        | data.types.links.realized-by.from | feature          |
        | data.types.links.realized-by.to   | element          |
        | data.types.links.decided-by.to    | adr              |
        | data.types.links.includes.from    | epic             |
        | data.types.facts.maturity.value   | rung             |
        | data.types.facts.start.on         | iteration, phase |
        | data.types.facts.met.on           | milestone        |
      When I run "sdp vocabulary"
      Then the output line with "decided-by" contains "spec, rule → adr"

  Rule: A configuration that cannot work stops sdp with the file and the key, not later in a spec or a query

    A misspelt key read as its default, or a word that no tag can hold, would turn something off
    without a word.

    Scenario Outline: A configuration that cannot work
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      Then loading the workspace fails with "sdp.config.yaml"
      And loading the workspace fails with "<problem>"
      And loading the workspace fails with '<path>'

      Examples:
        | config                                           | problem                                              | path                                        |
        | feature: ["specs/**/*.feature"]                  | excess property                                      | at ["feature"]                              |
        | features: specs/**/*.feature                     | Expected array                                       | at ["features"]                             |
        | vocabulary: { maturity: [] }                     | needs at least one level                             | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [idea, ready, idea] }    | idea repeats                                         | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [idea, verified] }       | verified is a stage sdp derives                      | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [idea, " "] }            | a word cannot be empty                               | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [idea, unrun] }          | unrun is a stage sdp derives                         | at ["vocabulary"]["maturity"]               |
        | vocabulary: { implemented: done }                | excess property                                      | at ["vocabulary"]["implemented"]            |
        | vocabulary: { kinds: { architecture: [rules] } } | excess property                                      | at ["vocabulary"]["kinds"]["architecture"]  |
        | vocabulary: { maturity: [idea, Verified] }       | Verified is a stage sdp derives                      | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [sketch, in-progress] }  | in-progress is a stage sdp derives                   | at ["vocabulary"]["maturity"]               |
        | vocabulary: { relations: { anchor: "" } }        | a word cannot be empty                               | at ["vocabulary"]["relations"]["anchor"]    |
        | vocabulary: { kinds: { decision: [] } }          | a role needs at least one word                       | at ["vocabulary"]["kinds"]["decision"]      |
        | vocabulary: { kinds: { milestone: [scenario] } } | scenario is a kind sdp makes itself                  | at ["vocabulary"]["kinds"]["milestone"]     |
        | vocabulary: { attributes: { activity: stage } }  | stage is an attribute sdp derives or checks itself   | at ["vocabulary"]["attributes"]["activity"] |
        | vocabulary: { relations: { anchor: iteration } } | iteration is also a relation of the plan             | at ["vocabulary"]["relations"]["anchor"]    |
        | vocabulary: { relations: { scenario: is } }      | is is also relations.anchor                          | at ["vocabulary"]["relations"]["scenario"]  |
        | vocabulary: { relations: { scenario: rule-of } } | rule-of is a relation sdp makes itself               | at ["vocabulary"]["relations"]["scenario"]  |
        | vocabulary: { relations: { plan: [in sprint] } } | `in sprint` cannot be the key of a tag               | at ["vocabulary"]["relations"]["plan"]      |
        | vocabulary: { kinds: { phase: ["a:b"] } }        | `a:b` cannot be the value of a tag                   | at ["vocabulary"]["kinds"]["phase"]         |
        | ids: { component: MY-COMP }                      | must be letters only                                 | at ["ids"]["component"]                     |
        | ids: { component: ARCH }                         | element and component share the prefix ARCH          | at ["ids"]                                  |
        | ids: { component: Arch }                         | element and component share the prefix ARCH, as Arch | at ["ids"]                                  |
        | ids: { scenario: SC }                            | scenario is a kind sdp makes itself                  | at ["ids"]["scenario"]                      |
        | timeout: 60 parsecs                              | 60 parsecs is not a duration                         | at ["timeout"]                              |
        | timeout: 90                                      | 90 is not a duration: a number and a unit            | at ["timeout"]                              |
