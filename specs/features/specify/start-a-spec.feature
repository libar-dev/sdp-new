@id=start-a-spec
@realized-by:ARCH-application @realized-by:ARCH-checker
Feature: Start a spec

  Whoever starts sdp in a repository, and every author who starts a spec, person or agent, needs a
  file to fill in and to know what to write in it next.

  Not a generator of content: a template writes what a spec is, and the rest is the author's.

  Rule: init writes the configuration with every default, the skill, and a .gitignore of what sdp run records, and overwrites nothing

    Whoever adopts sdp reads in one file every key there is and what sdp does without it, and changes
    one by uncommenting it. A file that exists is someone's work, so init only adds what is missing.

    Scenario: Run twice
      When I run "sdp init"
      Then the output contains "created .claude/skills/sdp/SKILL.md"
      And the file "sdp.config.yaml" contains "# features: "
      And the file ".gitignore" is:
        """
        .sdp/
        """
      When I run "sdp init"
      Then the output contains "exists  sdp.config.yaml"

    Scenario: A workspace configured in JSON already
      Given a file "sdp.config.json" containing:
        """
        { "exclude": ["notes/**"] }
        """
      When I run "sdp init"
      Then the exit code is 0
      And the output contains "exists  sdp.config.json"
      And the file "sdp.config.yaml" does not exist

    Scenario: Every key, commented out at its default
      When I run "sdp init"
      Then the exit code is 0
      And the keys commented out in "sdp.config.yaml" are every key of the configuration
      And "sdp.config.yaml" with every key uncommented reads as no configuration at all

  Rule: init writes a .gitignore only where git does not ignore .sdp/ already, and says what to add to one that does not ignore it rather than change it

    What sdp run records holds only in the checkout where it ran, so it stays out of every commit.

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

  Rule: init from an sdp that has lost its skill writes nothing, and says in one line which file is missing

    The skill is part of sdp, so an installation without it is broken: that is said before anything
    is written, never as a stack trace.

    Scenario: An sdp installed without its skill
      When I run "sdp init" with an sdp installed without its skill
      Then the exit code is 1
      And the output is one line containing ".claude/skills/sdp/SKILL.md"
      And the file "sdp.config.yaml" does not exist

  Rule: A new spec holds only what stays in it, and the answer says what to write next

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

  Rule: Any one-word kind is created in its kind's directory, its id the slug of its title after its kind's prefix, but for a rung, a stage or change that the workspace does not name a kind

    Scenario Outline: sdp new <kind>, <case>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      When I run "sdp new <kind> 'Go live'"
      Then the exit code is <exit code>
      And the output contains "<answer>"

      Examples:
        | kind      | case                    | config                                   | exit code | answer                                                   |
        | milestone | with a template         | # every key at its default               | 0         | MS-go-live\tspecs/plan/MS-go-live.feature                |
        | gizmo     | without one             | # every key at its default               | 0         | go-live\tspecs/gizmo/go-live.feature                     |
        | idea      | the first rung          | # every key at its default               | 1         | idea is a maturity, not a kind                           |
        | idea      | a kind of the workspace | vocabulary: { words: { kinds: [idea] } } | 0         | specs/idea/go-live.feature                               |
        | verified  | a stage                 | # every key at its default               | 1         | verified is a stage sdp derives from the run, not a kind |
        | change    | a change                | # every key at its default               | 1         | a change is rules of the feature it changes, not a kind  |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: An element or a pattern is declared where its code is, so new writes no file for one and says how to declare it

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

    Scenario Outline: Refused: <case>
      Given these specs:
        | tags       | Feature |
        | @id=search | Search  |
      And a file "specs/features/carts.feature" containing:
        """
        Notes on carts, not a spec.
        """
      When I run "sdp new feature <title>"
      Then the exit code is 1
      And the output contains "<answer>"

      Examples:
        | case               | title  | answer                                             |
        | An id that exists  | Search | id search already exists at specs/search.feature:1 |
        | A file that exists | Carts  | specs/features/carts.feature already exists        |

  Rule: new refuses what it cannot write as a spec that reads back as it was asked for, and says what it would take

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

  Rule: A spec written where no command reads it is written all the same, and the answer says why no command will read it

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

  Rule: Check reports a new spec only for what its author has yet to write: the text a template wrote, once per spec, and what a milestone closes

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

    Scenario: A spec with the text of its template twice
      Given a file "specs/decisions/use-postgres.feature" containing:
        """
        @id=use-postgres @kind=decision
        Feature: Use Postgres

          Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>.

          Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>.
        """
      When the workspace is checked
      Then sdp reports:
        | rule                 | severity | node         | line | message      |
        | template-placeholder | warning  | use-postgres | 4    | (and 1 more) |
