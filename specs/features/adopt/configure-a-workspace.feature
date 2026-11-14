@id=configure-a-workspace
@realized-by:ARCH-workspace @realized-by:ARCH-vocabulary
Feature: Configure a workspace

  A team that adopts sdp brings its own layout and its own words — user stories, ADRs, sprints. sdp
  works in any repository unconfigured; `sdp.config.yaml` (or `.yml`, or `.json`) at the root says
  where specs, code and step definitions are, how ids are prefixed, and which of the team's words
  play the roles sdp interprets.

  Not a schema for specs: kinds, relations and attributes are whatever authors write.

  Rule: A key left out keeps its default, a key written replaces it, and exclude adds to it

    Scenario Outline: Left out, replaced and added to, in YAML or JSON
      Given a file "notes/scratch.feature" containing:
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
        /** @sdp is ARCH-orders */
        export function order() {}
        """
      And a file "tools/report.ts" containing:
        """
        /** @sdp is ARCH-reports */
        export function report() {}
        """
      And a file "<file>" containing:
        """
        <config>
        """
      When I query "feature|code"
      Then the result is "<result>"

      Examples:
        | file            | config                      | result                               |
        | sdp.config.yaml |                             | scratch, code:src/orders.ts#order    |
        | sdp.config.yaml | code: ["tools/**/*.ts"]     | scratch, code:tools/report.ts#report |
        | sdp.config.json | { "exclude": ["notes/**"] } | code:src/orders.ts#order             |

  Rule: An id's prefix, sdp's or one ids adds, says its kind

    An id with no prefix sdp knows is a feature's, the spec a team writes most.

    Scenario Outline: <id> is a <kind>
      Given a file "sdp.config.yaml" containing:
        """
        ids: { requirement: US }
        """
      And these specs:
        | tags     | Feature |
        | @id=<id> | Spec    |
      Then the workspace node "<id>" has attribute kind = "<kind>"

      Examples:
        | id                 | kind        |
        | IT-beta            | iteration   |
        | US-signup          | requirement |
        | it-asset-inventory | feature     |

  @decided-by:free-vocabulary
  Rule: The team's own words play the roles sdp interprets, its maturity ladder included, in every command

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

  Rule: A configuration that cannot work stops sdp, with every problem at once, each at its file and key

    Worked around, it would answer from another configuration than the one written: a misspelt key
    would fall back to its default, and a word no tag can hold would match nothing. Whoever fixes it
    fixes it in one pass.

    Scenario: A misspelt key, a timeout without a unit and a rung written twice
      Given a file "sdp.config.yaml" containing:
        """
        timeout: 30
        vocabulary: { kind: { decision: [adr] }, maturity: [idea, idea] }
        """
      When I run "sdp q feature"
      Then the exit code is 1
      And the output is one line per configuration problem:
        | file            | key                        | message                 |
        | sdp.config.yaml | ["vocabulary"]["kind"]     | excess property         |
        | sdp.config.yaml | ["timeout"]                | 30 is not a duration    |
        | sdp.config.yaml | ["vocabulary"]["maturity"] | levels must be distinct |

    Scenario Outline: A configuration that cannot work
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      Then loading the workspace fails with "sdp.config.yaml"
      And loading the workspace fails with "<problem>"
      And loading the workspace fails with '<key>'

      Examples:
        | config                                                   | problem                                                        | key                                      |
        | vocabulary: { maturity: [idea, verified] }               | verified is a stage sdp derives                                | at ["vocabulary"]["maturity"]            |
        | vocabulary: { maturity: [] }                             | the maturity ladder needs at least one level                   | at ["vocabulary"]["maturity"]            |
        | vocabulary: { kinds: { decision: [""] } }                | a word cannot be empty                                         | at ["vocabulary"]["kinds"]["decision"]   |
        | vocabulary: { kinds: { decision: [] } }                  | a role needs at least one word                                 | at ["vocabulary"]["kinds"]["decision"]   |
        | vocabulary: { relations: { plan: ["planned for"] } }     | `planned for` cannot be the key of a tag                       | at ["vocabulary"]["relations"]["plan"]   |
        | vocabulary: { kinds: { decision: ["design decision"] } } | `design decision` cannot be the value of a tag                 | at ["vocabulary"]["kinds"]["decision"]   |
        | vocabulary: { kinds: { decision: [scenario] } }          | scenario is a kind sdp makes itself                            | at ["vocabulary"]["kinds"]["decision"]   |
        | vocabulary: { relations: { plan: [status] } }            | status is an attribute sdp derives or checks itself            | at ["vocabulary"]["relations"]["plan"]   |
        | vocabulary: { relations: { plan: [imports] } }           | imports is a relation sdp makes itself                         | at ["vocabulary"]["relations"]["plan"]   |
        | vocabulary: { relations: { anchor: iteration } }         | iteration is also a relation of the plan                       | at ["vocabulary"]["relations"]["anchor"] |
        | timeout: 0s                                              | 0s is not more than nothing                                    | at ["timeout"]                           |
        | ids: { component: ARCH }                                 | element and component share the prefix ARCH                    | at ["ids"]                               |
        | ids: { requirement: arch }                               | element and requirement share the prefix ARCH, as arch         | at ["ids"]                               |
        | ids: { requirement: US1 }                                | must be letters only                                           | at ["ids"]["requirement"]                |
        | ids: { scenario: SC }                                    | scenario is a kind sdp makes itself, so no id an author writes | at ["ids"]["scenario"]                   |

  Rule: Two configuration files in one workspace stop sdp, naming both

    Which one sdp read would depend on an order nobody sees, and what the other says would be
    ignored without a word.

    Scenario Outline: sdp.config.yaml beside sdp.config.json, then <command>
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      And a file "sdp.config.json" containing:
        """
        {}
        """
      When I run "<command>"
      Then the exit code is 1
      And the output is one line per configuration problem:
        | file                                | message                           |
        | sdp.config.yaml and sdp.config.json | a workspace has one configuration |
      And the file ".claude/skills/sdp/SKILL.md" does not exist

      Examples:
        | command       |
        | sdp q feature |
        | sdp init      |
