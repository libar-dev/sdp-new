@id=start-a-spec
@realized-by:ARCH-application @realized-by:ARCH-checker
Feature: Start a spec

  Whoever starts sdp in a repository, and every author who starts a spec, person or agent, needs a
  file to fill in and to know what to write in it next.

  Not a generator of content: a template writes what a spec is, and the rest is the author's.

  Rule: init writes the configuration with every default, the skill, and a .gitignore of what sdp run records, and overwrites nothing

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
        | kind         | title             | file                                         | tags                                                    | next                                                             |
        | feature      | Gift wrapping     | specs/features/gift-wrapping.feature         | @id=gift-wrapping @maturity=idea                        | say under the title who needs what, and why, before any solution |
        | architecture | Rules of the shop | specs/architecture/rules-of-the-shop.feature | @id=rules-of-the-shop @kind=architecture @maturity=idea | write a `Rule:` the code keeps, with an example                  |

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
        | kind      | case                    | config                                   | exit code | answer                                    |
        | milestone | with a template         | # every key at its default               | 0         | MS-go-live\tspecs/plan/MS-go-live.feature |
        | gizmo     | without one             | # every key at its default               | 0         | go-live\tspecs/gizmo/go-live.feature      |
        | idea      | the first rung          | # every key at its default               | 1         | idea is a maturity, not a kind            |
        | idea      | a kind of the workspace | vocabulary: { words: { kinds: [idea] } } | 0         | specs/idea/go-live.feature                |

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
