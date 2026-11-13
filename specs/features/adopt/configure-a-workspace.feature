@id=configure-a-workspace
@realized-by:ARCH-workspace @realized-by:ARCH-vocabulary
Feature: Configure a workspace

  A team that adopts sdp brings its own layout and its own words — user stories, ADRs, sprints. sdp
  works in any repository unconfigured; `sdp.config.yaml` (or `.yml`, or `.json`) at the root says
  where specs, code and step definitions are, how ids are prefixed, and which of the team's words
  play the roles sdp interprets.

  Not a schema for specs: kinds, relations and attributes are whatever authors write.

  Rule: A key left out keeps its default, a key written replaces it, and exclude adds to it

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

  Rule: An id's prefix says its kind, and an id with no prefix sdp knows is a feature; ids adds prefixes or renames them

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
  Rule: The vocabulary names the team's words for the roles sdp interprets, and its ladder of maturities, and every command reads them

    Scenario: Features called req, on a ladder of sketch and agreed
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { feature: [req] }, maturity: [sketch, agreed] }
        """
      And these specs:
        | tags                        | Feature |
        | @id=search @maturity=agreed | Search  |
      When I run "sdp new req 'Saved carts'"
      Then the exit code is 0
      And the file "specs/features/saved-carts.feature" contains "@id=saved-carts @maturity=sketch"
      When I run "sdp q 'req[maturity<agreed]' --ids"
      Then the exit code is 0
      And the output lines are "saved-carts"
      When I run "sdp vocabulary --json"
      Then the JSON output has:
        | data.vocabulary.kinds.feature | req            |
        | data.vocabulary.maturity      | sketch, agreed |

  Rule: A configuration that cannot work stops sdp with the file and the key

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
