@id=start-a-spec @maturity=implemented
@realized-by:ARCH-reports @realized-by:ARCH-checker
Feature: Start a spec

  Whoever starts sdp in a repository, and every author who starts a spec, person or agent, needs a
  file to fill in and to know what to write in it next: `sdp init` writes the configuration and the
  skill that teaches agents to work with sdp, `sdp new` a spec that holds only what stays in it.

  Not a generator of content: a template writes what a spec is, and from specified on a rule and a
  scenario to fill in; the rest is the author's.

  Rule: init starts a workspace where it is run, with a configuration that shows every default and the skill, and overwrites nothing

    The skill is the one generic guide to working with sdp, the same text sdp is developed with.

    Scenario: Run twice, below another workspace
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp init" in "shop"
      Then the output contains "created sdp.config.yaml"
      And the output contains "created .claude/skills/sdp/SKILL.md"
      And the file "shop/sdp.config.yaml" contains "# features: "
      And the file "shop/.claude/skills/sdp/SKILL.md" contains "name: sdp"
      When I run "sdp init" in "shop"
      Then the output contains "exists  sdp.config.yaml"
      And the output contains "exists  .claude/skills/sdp/SKILL.md"
      When I run "sdp check" in "shop"
      Then the exit code is 0

  Rule: A new spec holds only what stays in it, and the answer says what to write next

    Advice written into the file would outlive its use as prose nobody wrote.

    Scenario Outline: The file says what the spec is, and the answer what to write in it
      When I run "sdp new <kind> '<title>' <options>"
      Then the file "<file>" is:
        """
        <tags>
        Feature: <title>
        """
      And the output contains 'next: <next>'

      Examples:
        | kind    | title     | options | file                                  | tags                                    | next                                                                |
        | gizmo   | Sprocket  |         | specs/gizmo/sprocket.feature          | @id=sprocket @kind=gizmo @maturity=idea | write the idea in a sentence under the title                        |
        | pattern | Outbox    |         | specs/architecture/PAT-outbox.feature | @id=PAT-outbox @maturity=idea           | elements that apply it link `@instance-of:PAT-outbox`               |
        | risk    | Outage    |         | specs/risks/outage.feature            | @id=outage @kind=risk @maturity=idea    | link it: @affects:<feature> @mitigated-by:<feature> @due:MS-…       |
        | phase   | Hardening |         | specs/delivery/PH-hardening.feature   | @id=PH-hardening                        | say under the title what this phase takes on, and why in this order |

    Scenario: A decision starts as the sentence it must become, and the answer says which choices are decisions
      When I run "sdp new decision 'Use Postgres'"
      Then the file "specs/decisions/use-postgres.feature" is:
        """
        @id=use-postgres @kind=decision
        Feature: Use Postgres

          Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>.
        """
      And the output contains:
        """
        next: write what was chosen over what, why, and the cost accepted with it, in one to three sentences
        next: record a decision only for a choice that is hard to reverse, surprising without context and a real trade-off, and that spans features; a reason that concerns one feature is written under the rule it explains
        next: a rule that rests on it is written on the spec it constrains, tagged `@decided-by:use-postgres`
        """

  @maturity=draft @decided-by:architecture-is-declared-in-doc-comments
  Rule: A pattern is declared in its code like an element, so new writes no file for one, and the answer says how code plays it

  Rule: An element is declared where its code is, so new writes no file for one, and the answer says how its code declares it

    The code anchored to an element is the element, and that code's doc comment says what it is
    for: a file of its own would be prose that nothing keeps true.

    Scenario: An element
      When I run "sdp new element Orders"
      Then the exit code is 0
      And the output lines are "ARCH-orders"
      And the output contains:
        """
        next: no file is written: an element is declared where its code is, by the tag `@sdp is ARCH-orders` in the doc comment of a module-level declaration, or of the file in the comment that opens it
        next: the rest of that comment is its description: say there what it is for
        next: sdp arch shows it, with its code and the elements that code imports; a feature it realizes links it with `@realized-by:ARCH-orders`
        """
      And the file "specs/architecture/ARCH-orders.feature" does not exist

  Rule: A new feature is written where it stays, and a change has no file

    Nothing moves when a feature is built. A change to it is rules of it at the maturity they have
    reached, so it has no file of its own, unless a team has a kind of that name.

    Scenario: A feature, written where it stays
      When I run "sdp new feature 'Saved carts'"
      Then the file "specs/features/saved-carts.feature" is:
        """
        @id=saved-carts @maturity=idea
        Feature: Saved carts
        """
      And the output contains:
        """
        next: say under the title who needs what, and why, before any solution; then what it is not
        next: write a `Rule:` per requirement, quality ones included, as what a user can observe: the lines under it say why, its scenarios are the examples
        next: a quality requirement is a rule of the feature it constrains, with a measurable example: Given the environment, When the stimulus, Then the response and its measure, such as within 300 ms at p95 under 500 concurrent users
        next: write what is still unknown as a `Rule:` tagged `@open`, its name the question
        """
      And the output contains "next: it stays in this file: once it is built, declare it @maturity=implemented, and a rule still to come after that with a maturity of its own above `Rule:`"

    Scenario Outline: A change, <where>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      When I run "sdp new change 'Shared carts'"
      Then the exit code is <exit code>
      And the output contains "<answer>"

      Examples:
        | where                                   | config                                     | exit code | answer                                                                                      |
        | as sdp has it                           | # every key at its default                 | 1         | a change is rules of the feature it changes: write each as a `Rule:` in that feature's file |
        | in a workspace with a kind of that name | vocabulary: { words: { kinds: [change] } } | 0         | specs/change/shared-carts.feature                                                           |

  Rule: Any one-word kind can be created, and new --help names those with a template of their own

    Kinds are the team's own words, not a list sdp keeps: a kind without a template gets a spec with
    its id and its kind.

    Scenario: A kind without a template
      When I run "sdp new --help"
      Then the output contains "feature, idea, decision, element, pattern, milestone, plan, phase, iteration, risk"
      And the output contains "idea (default), draft, specified, ready or implemented"
      When I run "sdp new gizmo Sprocket"
      Then the output lines are "sprocket\tspecs/gizmo/sprocket.feature"
      And the file "specs/gizmo/sprocket.feature" contains "@id=sprocket @kind=gizmo"

  Rule: A new spec's id is an ASCII slug of its title, or a number, after its kind's prefix where it has one, and its file is named by it

    An id says what it names, so whoever reads a message that cites it needs no lookup. What a spec
    says is name enough: only elements, patterns, milestones, phases and iterations have a prefix,
    unless the workspace gives one to another kind. Only a title with no letters to slug gets a
    number, after its kind where it has no prefix.

    Scenario Outline: By kind and title, or as --id and --dir say, relative to the workspace root or absolute
      When I run "sdp new <arguments>"
      Then the output lines are "<id>\t<file>"
      And the file "<file>" contains "@id=<id>"

      Examples:
        | arguments                                               | id                 | file                                      |
        | milestone 'Kasse für Gäste'                             | MS-kasse-fur-gaste | specs/delivery/MS-kasse-fur-gaste.feature |
        | milestone 'Корзина'                                     | MS-0001            | specs/delivery/MS-0001.feature            |
        | idea 'Gift wrapping'                                    | gift-wrapping      | specs/features/gift-wrapping.feature      |
        | feature 'Корзина'                                       | feature-0001       | specs/features/feature-0001.feature       |
        | decision 'Ödeme yöntemi'                                | odeme-yontemi      | specs/decisions/odeme-yontemi.feature     |
        | milestone 'Go-live'                                     | MS-go-live         | specs/delivery/MS-go-live.feature         |
        | feature 'Gift cards' --id vouchers --dir specs/payments | vouchers           | specs/payments/vouchers.feature           |
        | feature 'Gift cards' --dir $PWD/specs/payments          | gift-cards         | specs/payments/gift-cards.feature         |

    Scenario: A title that leaves no ASCII letter or digit to slug is numbered after the highest number its kind has
      Given these specs:
        | tags              | Feature  |
        | @id=ARCH-0007     | Корзина  |
        | @id=ARCH-checkout | Checkout |
      When I run "sdp new element 'Платёж'"
      Then the output lines are "ARCH-0008"
      When I run "sdp new element 'Платёж 2'"
      Then the output lines are "ARCH-2"

    Scenario: A file outside the workspace, or where its features globs do not look, is in no graph, and the answer says so
      Given a file "shop/sdp.config.yaml" containing:
        """
        features: ["requirements/**/*.feature"]
        """
      When I run "sdp -C shop new feature 'Gift cards'"
      Then the output contains "specs/features/gift-cards.feature is matched by no features glob (requirements/**/*.feature)"
      When I run "sdp -C shop new feature 'Gift cards' --dir $PWD/elsewhere"
      Then the output contains "/elsewhere/gift-cards.feature is outside the workspace"
      When I run "sdp -C shop new feature 'Gift cards' --dir requirements"
      Then the output does not contain "note:"

  Rule: A new spec fails the check only for what its author has yet to write

    Scenario: Every template, at its first maturity level and above it
      Given specs created from the sdp new templates:
        | kind      | title         | maturity    |
        | gizmo     | Sprocket      | idea        |
        | idea      | Gift wrapping |             |
        | pattern   | Outbox        |             |
        | phase     | Elaboration   |             |
        | milestone | Launch        |             |
        | risk      | Outage        |             |
        | feature   | Gift cards    | draft       |
        | feature   | Returns       | specified   |
        | feature   | Wishlist      | ready       |
        | feature   | Exports       | implemented |
        | decision  | Use Postgres  |             |
      When the workspace is checked
      Then sdp reports:
        | rule                 | node         | line |
        | maturity-criteria    | gift-cards   | 1    |
        | maturity-criteria    | returns      | 1    |
        | maturity-criteria    | wishlist     | 1    |
        | maturity-criteria    | exports      | 1    |
        | template-placeholder | returns      | 4    |
        | template-placeholder | wishlist     | 4    |
        | template-placeholder | exports      | 4    |
        | template-placeholder | use-postgres | 4    |

    Scenario: From specified on, the file has a rule with a scenario to fill in
      When I run "sdp new feature 'Saved carts' --maturity specified"
      Then the file "specs/features/saved-carts.feature" is:
        """
        @id=saved-carts @maturity=specified
        Feature: Saved carts

          Rule: <the rule, in one sentence>

            Scenario: <the main success case>
              Given <context>
              When <action>
              Then <observable outcome>
        """

  Rule: Text a template wrote is flagged until it is filled in, once per spec, at the first

    A template writes text to replace in several places, and one finding is enough to send its
    author to the file.

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

    Scenario: An id or a file that exists
      Given these specs:
        | tags       | Feature |
        | @id=search | Search  |
      When I run "sdp new feature Search"
      Then the exit code is 1
      And the output contains "id search already exists at specs/search.feature:1"
      Given a file "specs/features/carts.feature" containing:
        """
        Notes on carts, not a spec.
        """
      When I run "sdp new feature Carts"
      Then the exit code is 1
      And the output contains "specs/features/carts.feature already exists"

    Scenario: An id that only a dangling link names is free: creating it resolves the link
      Given these specs:
        | tags                           | Feature |
        | @id=filters @depends-on:facets | Filters |
      When I run "sdp new feature Facets"
      Then the output contains "facets\tspecs/features/facets.feature"
      When I run "sdp check"
      Then the exit code is 0

    Scenario Outline: A title reads back as written, however it looks
      Given specs created from the sdp new templates:
        | kind    | title   |
        | feature | <title> |
      When the workspace is checked
      Then sdp reports nothing
      And node "<id>" has attribute title = "<title>"

      Examples:
        | title                | id                  |
        | Checkout: guest flow | checkout-guest-flow |
        | Cart #2              | cart-2              |
        | 'Quoted' carts       | quoted-carts        |
        | true                 | true                |
        | 2026-11-12           | 2026-11-12          |
        | [draft] Wishlist     | draft-wishlist      |
        | - Returns            | returns             |
        | @team: Invoices      | team-invoices       |

    Scenario: An id that would not read back
      When I run "sdp new feature Carts --id ' '"
      Then the exit code is 1
      And the output contains "would not read back"
