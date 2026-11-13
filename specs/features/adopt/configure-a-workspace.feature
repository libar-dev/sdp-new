@id=configure-a-workspace
@realized-by:ARCH-workspace @realized-by:ARCH-vocabulary
Feature: Configure a workspace

  A team that adopts sdp brings its own repository layout and its own words: user stories rather
  than requirements, ADRs rather than decisions, sprints rather than iterations. sdp works in any
  repository unconfigured; a team writes `sdp.config.yaml` (or `.yml`, or `.json`) at the root of
  the workspace to say where specs, code and step definitions are, how ids are prefixed, and which
  of its words play the roles sdp interprets.

  Not a schema for specs: kinds, relations and attributes are whatever authors write.

  Rule: A key left out keeps its default; a list or value written replaces it and exclude adds to it, while ids and vocabulary change only the entries they name

    The defaults find specs and code where most repositories keep them, so an empty file or none at
    all is a configuration that works.

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
      When I query "feature|code"
      Then the result is "<result>"

      Examples:
        | key                          | file            | config                      | result                                      |
        | No key                       | sdp.config.yaml |                             | login, scratch, code:src/orders.ts#order    |
        | A list of code, replaced     | sdp.config.yaml | code: ["tools/**/*.ts"]     | login, scratch, code:tools/report.ts#report |
        | An exclusion, added, in JSON | sdp.config.json | { "exclude": ["notes/**"] } | login, code:src/orders.ts#order             |

  Rule: An id's prefix says its kind as it is configured, before - or _, and an id with no prefix sdp knows is a feature; ids adds prefixes or renames them

    So an id says what it is wherever it is cited. A prefix in another case is a word: an IT asset
    inventory is no iteration.

    Scenario Outline: <id> is a <kind>
      Given a file "sdp.config.yaml" containing:
        """
        ids: { requirement: US }
        """
      And these specs:
        | tags     | Feature |
        | @id=<id> | Spec    |
      Then node "<id>" has attribute kind = "<kind>"

      Examples:
        | id                 | kind        |
        | IT-beta            | iteration   |
        | US-signup          | requirement |
        | it-asset-inventory | feature     |

  @decided-by:free-vocabulary
  Rule: The vocabulary says which of the team's words play the roles sdp interprets, and every command reads them

    A team keeps its own words, and sdp still knows which nodes are its features, its architecture,
    its decisions and milestones, and which links plan work.

    Scenario: Features called req, written, checked and planned
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
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.disciplines.requirements | 1           |
        | data.unplanned                | saved-carts |

  @decided-by:free-vocabulary
  Rule: A ladder of the team's own orders the maturities of work still to come, and a value off it ranks below every rung

    sdp reads no meaning into a rung: any maturity says the work is still to come, and a question for
    what has not come far enough finds a value off the ladder too.

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

  Rule: sdp vocabulary prints the words sdp interprets as a configuration that reads back, and the words it makes itself, which nothing configures

    A team sees which of its words sdp reads meaning into, and starts its own profile from the one
    in force.

    Scenario: A team's word for decisions, read back from a copy, and the stages sdp makes itself
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { decision: [adr] } }
        """
      When I run the pipeline:
        """
        sdp vocabulary --json | jq '{ vocabulary: .data.vocabulary }' > copied.json
        rm sdp.config.yaml
        mv copied.json sdp.config.json
        """
      Then the exit code is 0
      When I run "sdp vocabulary --json"
      Then the JSON output has:
        | data.vocabulary.kinds.decision | adr                                   |
        | data.vocabulary.maturity       | idea, draft, specified, ready         |
        | data.made.stages               | unrun, failing, in-progress, verified |

  Rule: sdp vocabulary prints the type of each word that joins two nodes or takes a value, in the workspace's words

    An agent that links a feature reads what it may link to before it writes the tag, and check
    holds the link to the same type.

    Scenario: A team's words for decisions and for planning, in the types
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { decision: [adr] }, relations: { plan: [scheduled] } }
        """
      When I run "sdp vocabulary --json"
      Then the JSON output has:
        | data.types.links.realized-by.from | feature   |
        | data.types.links.realized-by.to   | element   |
        | data.types.links.decided-by.to    | adr       |
        | data.types.links.scheduled.to     | iteration |

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
        | config                                     | problem                                     | path                          |
        | feature: ["specs/**/*.feature"]            | excess property                             | at ["feature"]                |
        | vocabulary: { maturity: [idea, verified] } | verified is a stage sdp derives             | at ["vocabulary"]["maturity"] |
        | ids: { component: ARCH }                   | element and component share the prefix ARCH | at ["ids"]                    |
