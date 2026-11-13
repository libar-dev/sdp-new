@id=start-a-spec
@realized-by:ARCH-application @realized-by:ARCH-checker
Feature: Start a spec

  Whoever starts sdp in a repository, and every author who starts a spec, person or agent, needs a
  file to fill in and to know what to write in it next: `sdp init` writes the configuration and the
  skill that teaches agents to work with sdp, `sdp new` a spec that holds only what stays in it.

  Not a generator of content: a template writes what a spec is, and the rest is the author's.

  Rule: init starts a workspace where it is run, with a configuration that shows every default and the skill, and overwrites nothing

    Scenario: Run twice, below another workspace
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp init" in "shop"
      Then the output contains "created sdp.config.yaml"
      And the output contains "created .claude/skills/sdp/SKILL.md"
      And the file "shop/sdp.config.yaml" contains "# features: "
      When I run "sdp init" in "shop"
      Then the output contains "exists  sdp.config.yaml"
      When I run "sdp check --base none" in "shop"
      Then the exit code is 0

  Rule: init keeps what sdp run records out of git: it writes a .gitignore of .sdp/ where git does not ignore it, or says to add .sdp/ to the one there

    A result holds only in the checkout where it ran: committed, it would tell a clone that work is
    verified that never ran there.

    Scenario: A workspace started, run, committed and cloned
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: The workspace has no error

            Scenario: No error
              Then there are no error diagnostics
        """
      When I run "sdp init"
      Then the file ".gitignore" is:
        """
        .sdp/
        """
      When I run "sdp run"
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run "git clone -q . clone"
      Then the exit code is 0
      When I run "sdp q 'feature[stage=verified]' --ids" in "clone"
      Then the exit code is 0
      And the output lines are ""

  Rule: A new spec holds only what stays in it, and the answer says what to write next

    Advice written into the file would outlive its use as prose nobody wrote.

    Scenario Outline: The file says what the spec is, and the answer what to write in it
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
        | phase        | Hardening         | specs/plan/PH-hardening.feature              | @id=PH-hardening                                        | say under the title what this phase takes on                     |
        | architecture | Rules of the shop | specs/architecture/rules-of-the-shop.feature | @id=rules-of-the-shop @kind=architecture @maturity=idea | write a `Rule:` the code keeps, with an example                  |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: An element or a pattern is declared where its code is, so new writes no file for one, and the answer says how its code declares it

    The code anchored to an element is the element: a file of its own would be prose that nothing
    keeps true.

    Scenario Outline: An element and a pattern
      When I run "sdp new <kind> <title>"
      Then the exit code is 0
      And the output lines are "<id>"
      And the output contains "`@sdp is <id>`"
      And the file "specs/architecture/<id>.feature" does not exist

      Examples:
        | kind    | title  | id          |
        | element | Orders | ARCH-orders |
        | pattern | Outbox | PAT-outbox  |

  Rule: Any one-word kind can be created, in the directory sdp gives its kind, and a feature where it stays

    Kinds are the team's own words, not a list sdp keeps. Nothing moves when a feature is built.

    Scenario Outline: A <kind>, under <directory>
      When I run "sdp new <kind> 'Go live'"
      Then the output lines are "<id>\t<directory>/<id>.feature"

      Examples:
        | kind      | directory      | id         |
        | feature   | specs/features | go-live    |
        | milestone | specs/plan     | MS-go-live |
        | gizmo     | specs/gizmo    | go-live    |

  Rule: A kind named like a rung of the ladder or a stage, or change, is refused unless the workspace has a kind of that name, and the answer says what to write instead

    How far work has come is its maturity, never its kind, and a change is rules of the feature it
    changes.

    Scenario Outline: sdp new <kind>, <where>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      When I run "sdp new <kind> 'Gift wrapping'"
      Then the exit code is <exit code>
      And the output contains '<answer>'

      Examples:
        | kind   | where                                   | config                                   | exit code | answer                                                                                                   |
        | idea   | the first rung                          | # every key at its default               | 1         | idea is a maturity, not a kind: sdp new feature "Gift wrapping" writes a feature at idea, the first rung |
        | change | the kind sdp retired                    | # every key at its default               | 1         | a change is rules of the feature it changes, not a kind                                                  |
        | idea   | in a workspace with a kind of that name | vocabulary: { words: { kinds: [idea] } } | 0         | specs/idea/gift-wrapping.feature                                                                         |

  Rule: A new spec's id is the slug of its title, as a rule's is of its name, or a number, after its kind's prefix where it has one, and its file is named by it

    An id says what it names, so whoever reads a message that cites it needs no lookup. Only a title
    with no letter or digit to slug gets a number.

    Scenario Outline: By kind and title, or as --id and --dir say
      When I run "sdp new <arguments>"
      Then the output lines are "<id>\t<file>"

      Examples:
        | arguments                                               | id                 | file                                  |
        | milestone 'Kasse für Gäste'                             | MS-kasse-fur-gaste | specs/plan/MS-kasse-fur-gaste.feature |
        | decision '🛒'                                           | decision-0001      | specs/decisions/decision-0001.feature |
        | feature 'Gift cards' --id vouchers --dir specs/payments | vouchers           | specs/payments/vouchers.feature       |

  Rule: Check reports a new spec only for what its author has yet to write: template text, and what a milestone closes

    At any maturity a feature starts as its tags and its title: what it says next is the author's.

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

  Rule: Text a template wrote is flagged until it is filled in, once per spec, at the first

    One finding is enough to send its author to the file.

    Scenario Outline: A rule, a scenario and a step as the template wrote them
      Given a file "specs/reports.feature" containing:
        """
        @id=reports @maturity=ready
        Feature: Reports

          Analysts export reports.

          Rule: <rule>

            Scenario: <scenario>
              Then <outcome>
        """
      When the workspace is checked
      Then sdp reports:
        | rule                 | node    | at                           | message   |
        | template-placeholder | reports | specs/reports.feature:<line> | <message> |

      Examples:
        | rule                        | scenario                | outcome              | line | message                                          |
        | <the rule, in one sentence> | <the main success case> | <observable outcome> | 6    | "Rule: <the rule, in one sentence>" (and 2 more) |
        | Reports are exported        | Export                  | <observable outcome> | 9    | "Then <observable outcome>"                      |

  Rule: new never overwrites, and never writes a spec that would not read back as written

    Scenario Outline: An id that exists, and one that would not read back
      Given these specs:
        | tags       | Feature |
        | @id=search | Search  |
      When I run "sdp new feature <arguments>"
      Then the exit code is 1
      And the output contains "<answer>"

      Examples:
        | case                           | arguments      | answer                                             |
        | An id that exists              | Search         | id search already exists at specs/search.feature:1 |
        | An id that would not read back | Carts --id ' ' | would not read back                                |
