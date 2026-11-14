@id=start-a-spec
@realized-by:ARCH-application @realized-by:ARCH-checker
Feature: Start a spec

  Whoever starts sdp in a repository, and every author who starts a spec, person or agent, needs a
  file to fill in and to know what to write in it next.

  Not a generator of content: a template writes what a spec is, and the rest is the author's.

  Rule: Every workspace init starts has the skill that teaches agents to work with sdp

    The skill is part of sdp, so an installation without it is broken: that is said, with the file
    it misses, before anything is written.

    Scenario: In an empty directory
      When I run "sdp init"
      Then the exit code is 0
      And the file ".claude/skills/sdp/SKILL.md" contains "name: sdp"

    Scenario: An sdp installed without its skill
      When I run "sdp init" with an sdp installed without its skill
      Then the exit code is 1
      And the output is one line containing ".claude/skills/sdp/SKILL.md"
      And the file "sdp.config.yaml" does not exist

  Rule: The configuration init writes lists every key, commented out at its default

    Whoever adopts sdp reads in one file every key there is and what sdp does without it, and changes
    one by uncommenting it.

    Scenario: Every key
      When I run "sdp init"
      Then the exit code is 0
      And the keys commented out in "sdp.config.yaml" are every key of the configuration
      And "sdp.config.yaml" with every key uncommented reads as no configuration at all

  Rule: init overwrites no file, nor writes a configuration beside one of another format

    A file that exists is someone's work, and a workspace has one configuration.

    Scenario: A workspace configured in JSON, started twice
      Given a file "sdp.config.json" containing:
        """
        { "exclude": ["notes/**"] }
        """
      When I run "sdp init"
      Then the exit code is 0
      And the output contains "exists  sdp.config.json"
      And the file "sdp.config.yaml" does not exist
      When I run "sdp init"
      Then the exit code is 0
      And the output contains "exists  .claude/skills/sdp/SKILL.md"

  Rule: Where git does not ignore .sdp/, init writes a .gitignore of it, or says to add it to the one there

    What sdp run records holds only in the checkout where it ran, so it stays out of every commit.

    Scenario: No .gitignore
      When I run "sdp init"
      Then the exit code is 0
      And the file ".gitignore" is:
        """
        .sdp/
        """

    Scenario Outline: A .gitignore that <case>
      Given a file ".gitignore" containing:
        """
        <content>
        """
      When I run "sdp init"
      Then the exit code is 0
      And the output contains "next: add .sdp/ to .gitignore" <told> times
      And the file ".gitignore" is:
        """
        <content>
        """

      Examples:
        | case                  | content       | told |
        | ignores .sdp/         | /.sdp/        | 0    |
        | does not ignore .sdp/ | node_modules/ | 1    |

    Scenario: A repository that ignores .sdp/ above the workspace
      Given a file ".gitignore" containing:
        """
        .sdp/
        """
      And the files are committed on the branch "main"
      When I run "sdp init" in "shop"
      Then the exit code is 0
      And the file "shop/.gitignore" does not exist

  Rule: new writes only what stays in a spec, and says in its answer what to write next

    An instruction left in a spec would be read as the spec.

    Scenario Outline: A new <kind>
      When I run "sdp new <kind> '<title>'"
      Then the file "<file>" is:
        """
        <tags>
        Feature: <title>
        """
      And the output contains 'next: <next>'

      Examples:
        | kind         | title             | file                                         | tags                                                    | next                                                                |
        | feature      | Gift wrapping     | specs/features/gift-wrapping.feature         | @id=gift-wrapping @maturity=idea                        | say under the title who needs what, and why, before any solution    |
        | architecture | Rules of the shop | specs/architecture/rules-of-the-shop.feature | @id=rules-of-the-shop @kind=architecture @maturity=idea | write a `Rule:` the code keeps, with an example                     |
        | phase        | Elaboration       | specs/plan/PH-elaboration.feature            | @id=PH-elaboration                                      | say under the title what this phase takes on, and why in this order |

  Rule: new writes any one-word kind in its kind's directory, its id the slug of its title after the kind's prefix

    Scenario Outline: sdp new <kind>, <case>
      When I run "sdp new <kind> 'Go live'"
      Then the exit code is 0
      And the output lines are "<answer>"

      Examples:
        | kind      | case            | answer                                    |
        | milestone | with a template | MS-go-live\tspecs/plan/MS-go-live.feature |
        | gizmo     | without one     | go-live\tspecs/gizmo/go-live.feature      |

  Rule: new refuses a rung, a stage or change as a kind, unless the workspace names it a kind

    Scenario Outline: Named like <case>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      When I run "sdp new <kind> 'Go live'"
      Then the exit code is <exit code>
      And the output contains "<answer>"

      Examples:
        | kind     | case                              | config                                   | exit code | answer                                                   |
        | idea     | the first rung                    | # every key at its default               | 1         | idea is a maturity, not a kind                           |
        | idea     | a rung the workspace names a kind | vocabulary: { words: { kinds: [idea] } } | 0         | specs/idea/go-live.feature                               |
        | verified | a stage                           | # every key at its default               | 1         | verified is a stage sdp derives from the run, not a kind |
        | change   | a change                          | # every key at its default               | 1         | a change is rules of the feature it changes, not a kind  |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: new writes no file for an element or a pattern, but says how its code declares it

    Scenario Outline: Declared in its code: a <kind>
      When I run "sdp new <kind> <title>"
      Then the output lines are "<id>"
      And the output contains "`@sdp is <id>`"
      And the file "specs/architecture/<id>.feature" does not exist

      Examples:
        | kind    | title  | id          |
        | element | Orders | ARCH-orders |
        | pattern | Outbox | PAT-outbox  |

  Rule: new never overwrites a spec or a file

    Scenario Outline: A new feature where <case>
      Given these specs:
        | tags                                          | Feature |
        | @id=search @maturity=idea @depends-on:catalog | Search  |
      And a file "specs/features/carts.feature" containing:
        """
        Notes on carts, not a spec.
        """
      When I run "sdp new feature <title>"
      Then the exit code is <exit code>
      And the output contains "<answer>"

      Examples:
        | case                    | title   | exit code | answer                                             |
        | an id exists            | Search  | 1         | id search already exists at specs/search.feature:1 |
        | a file exists           | Carts   | 1         | specs/features/carts.feature already exists        |
        | only a link names an id | Catalog | 0         | catalog\tspecs/features/catalog.feature            |

  Rule: new refuses what it cannot write as a spec that reads back as asked, and says what it would take

    A file that read back with another id, kind or maturity, or that sat in another directory, would
    be a spec its author did not ask for.

    Scenario Outline: Cannot be written: <case>
      When I run "<command>"
      Then the exit code is 1
      And the output contains "<answer>"

      Examples:
        | case                          | command                                          | answer                                                                            |
        | a kind of two words           | sdp new 'gift wrap' Box                          | is not a kind: a kind is one word                                                 |
        | no title                      | sdp new feature ''                               | a feature needs a title                                                           |
        | an id with a slash            | sdp new feature Carts --id billing/carts         | cannot name a file: write it without a slash, and choose the directory with --dir |
        | an id with a #                | sdp new feature Carts --id carts#totals          | holds #, which names a rule or an example of a spec                               |
        | an id no tag reads back       | sdp new feature Carts --id 'two words'           | would not read back from a tag                                                    |
        | no directory                  | sdp new feature Carts --dir ''                   | --dir needs a directory                                                           |
        | a maturity of two words       | sdp new feature Carts --maturity 'not yet'       | a maturity is one word                                                            |
        | a maturity off the ladder     | sdp new feature Carts --maturity done            | done is no rung of the ladder idea, draft, specified, ready                       |
        | a maturity of what is no work | sdp new decision 'Use Postgres' --maturity draft | kind decision belongs to no discipline, so it is no work                          |

  Rule: new writes a spec where no command reads it, and says why none will

    Where it goes is its author's choice, and the features globs may be about to look there; but a
    spec no command reads is in no graph, no check and no run, which its author has to know.

    Scenario Outline: Written <case>
      Given a file "sdp.config.yaml" containing:
        """
        features: ["specs/**/*.feature"]
        """
      When I run "sdp new feature 'Gift wrapping' --dir <dir>"
      Then the exit code is 0
      And the file "<dir>/gift-wrapping.feature" contains "@id=gift-wrapping"
      And the output line with "note: " contains "<note>"

      Examples:
        | case                         | dir                      | note                                                                           |
        | where no features glob looks | docs                     | docs/gift-wrapping.feature is matched by no features glob (specs/**/*.feature) |
        | outside the workspace        | ../outside-the-workspace | gift-wrapping.feature is outside the workspace                                 |

  Rule: check reports of what init and new wrote only what its author has yet to write, also once committed

    Scenario: Every template, at its first maturity and at another
      Given specs created from the sdp new templates:
        | kind      | title         | maturity |
        | feature   | Gift wrapping |          |
        | feature   | Wishlist      | ready    |
        | milestone | Launch        |          |
        | decision  | Use Postgres  |          |
      When the workspace is checked
      Then sdp reports:
        | rule                 | severity | node         | line |
        | plan-reference       | warning  | MS-launch    | 1    |
        | template-placeholder | warning  | use-postgres | 4    |

    Scenario: A template's text twice, and an outline's parameters
      Given a file "specs/decisions/use-postgres.feature" containing:
        """
        @id=use-postgres @kind=decision
        Feature: Use Postgres

          <What was chosen, and why, in one to three sentences.>

          <What was chosen, and why, in one to three sentences.>
        """
      And a file "specs/gift-wrapping.feature" containing:
        """
        @id=gift-wrapping
        Feature: Gift wrapping

          Rule: A gift is wrapped in the paper chosen

            Scenario Outline: <case>
              Given <paper>
              Then the gift is wrapped in <paper>

              Examples:
                | case        | paper       |
                | Plain paper | plain paper |
        """
      When the workspace is checked
      Then sdp reports:
        | rule                 | severity | node         | line | message      |
        | template-placeholder | warning  | use-postgres | 4    | (and 1 more) |

    Scenario: A repository of your own, started and committed
      When I run "sdp init"
      Then the exit code is 0
      When I run "sdp new feature 'Gift wrapping'"
      Then the exit code is 0
      When I run "sdp new decision 'Use Postgres for orders'"
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run "sdp check"
      Then the exit code is 0
