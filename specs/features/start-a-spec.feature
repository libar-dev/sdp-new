@id=start-a-spec @kind=feature @maturity=ready
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
      When I run "sdp new <kind> '<title>'"
      Then the file "<file>" is:
        """
        <tags>
        Feature: <title>
        """
      And the output contains 'next: <next>'

      Examples:
        | kind        | title       | file                                       | tags                               | next                                                                                 |
        | requirement | Saved carts | specs/requirements/REQ-saved-carts.feature | @id=REQ-saved-carts @maturity=idea | write the idea in a sentence under the title                                         |
        | element     | Orders      | specs/architecture/ARCH-orders.feature     | @id=ARCH-orders                    | anchor it next to the declaration that is it: annotate(Thing, { is: "ARCH-orders" }) |
        | pattern     | Outbox      | specs/architecture/PAT-outbox.feature      | @id=PAT-outbox                     | elements that apply it link `@instance-of:PAT-outbox`                                |
        | risk        | Outage      | specs/risks/RISK-outage.feature            | @id=RISK-outage                    | link it: @affects:REQ-… @mitigated-by:REQ-… @due:MS-…                                |
        | phase       | Hardening   | specs/delivery/PH-hardening.feature        | @id=PH-hardening                   | say under the title what this phase takes on, and why in this order                  |

  Rule: Any one-word kind can be created, and new --help names those with a template of their own

    Kinds are the team's own words, not a list sdp keeps: a kind without a template gets a spec with
    its id and its kind.

    Scenario: A kind without a template
      When I run "sdp new --help"
      Then the output contains "requirement, idea, nfr, decision, element, pattern, milestone, plan, phase, iteration, risk"
      And the output contains "idea (default), draft, specified or ready"
      When I run "sdp new gizmo Sprocket"
      Then the output lines are "GIZM-sprocket\tspecs/gizmo/GIZM-sprocket.feature"
      And the file "specs/gizmo/GIZM-sprocket.feature" contains "@id=GIZM-sprocket @kind=gizmo"

  Rule: A new spec's id is the kind's prefix and an ASCII slug of its title, or a number, and its file is named by it

    An id says what it names, so whoever reads a message that cites it needs no lookup; only a title
    with no letters to slug gets a number.

    Scenario Outline: By kind and title, or as --id and --dir say, relative to the workspace root or absolute
      When I run "sdp new <arguments>"
      Then the output lines are "<id>\t<file>"
      And the file "<file>" contains "@id=<id>"

      Examples:
        | arguments                                                       | id                  | file                                           |
        | requirement 'Kasse für Gäste'                                   | REQ-kasse-fur-gaste | specs/requirements/REQ-kasse-fur-gaste.feature |
        | requirement 'Корзина'                                           | REQ-0001            | specs/requirements/REQ-0001.feature            |
        | idea 'Gift wrapping'                                            | REQ-gift-wrapping   | specs/requirements/REQ-gift-wrapping.feature   |
        | decision 'Ödeme yöntemi'                                        | DEC-odeme-yontemi   | specs/decisions/DEC-odeme-yontemi.feature      |
        | risk 'Vendor lock-in'                                           | RISK-vendor-lock-in | specs/risks/RISK-vendor-lock-in.feature        |
        | requirement 'Gift cards' --id REQ-vouchers --dir specs/payments | REQ-vouchers        | specs/payments/REQ-vouchers.feature            |
        | requirement 'Gift cards' --dir $PWD/specs/payments              | REQ-gift-cards      | specs/payments/REQ-gift-cards.feature          |

    Scenario: A title with no letters to slug is numbered after the highest number its kind has
      Given these specs:
        | tags                       | Feature |
        | @id=REQ-0007               | Корзина |
        | @id=REQ-checkout           | Checkout |
      When I run "sdp new requirement 'Платёж'"
      Then the output lines are "REQ-0008\tspecs/requirements/REQ-0008.feature"

    Scenario: A file outside the workspace, or where its features globs do not look, is in no graph, and the answer says so
      Given a file "shop/sdp.config.yaml" containing:
        """
        features: ["requirements/**/*.feature"]
        """
      When I run "sdp -C shop new requirement 'Gift cards'"
      Then the output contains "specs/requirements/REQ-gift-cards.feature is matched by no features glob (requirements/**/*.feature)"
      When I run "sdp -C shop new requirement 'Gift cards' --dir $PWD/elsewhere"
      Then the output contains "/elsewhere/REQ-gift-cards.feature is outside the workspace"
      When I run "sdp -C shop new requirement 'Gift cards' --dir requirements"
      Then the output does not contain "note:"

  Rule: A new spec fails the check only for what its author has yet to write

    Scenario: Every template, at its first maturity level and above it
      Given specs created from the sdp new templates:
        | kind        | title         | maturity  |
        | requirement | Wishlist      | idea      |
        | idea        | Gift wrapping |           |
        | element     | Orders        |           |
        | pattern     | Outbox        |           |
        | phase       | Elaboration   |           |
        | milestone   | Launch        |           |
        | risk        | Outage        |           |
        | requirement | Gift cards    | draft     |
        | requirement | Returns       | specified |
        | nfr         | Availability  | ready     |
        | decision    | Use Postgres  |           |
      When the workspace is checked
      Then sdp reports:
        | rule                 | node             | line |
        | maturity-criteria    | NFR-availability | 1    |
        | maturity-criteria    | REQ-gift-cards   | 1    |
        | maturity-criteria    | REQ-returns      | 1    |
        | template-placeholder | REQ-returns      | 4    |
        | template-placeholder | NFR-availability | 4    |
        | template-placeholder | DEC-use-postgres | 4    |

    Scenario: From specified on, the file has a rule with a scenario to fill in
      When I run "sdp new nfr 'Checkout latency' --maturity specified"
      Then the file "specs/quality/NFR-checkout-latency.feature" is:
        """
        @id=NFR-checkout-latency @maturity=specified
        Feature: Checkout latency

          Rule: <the rule, in one sentence>

            Scenario: <quality attribute scenario>
              Given <environment, e.g. normal load of 500 concurrent users>
              When <stimulus, e.g. a user submits an order>
              Then <response measure, e.g. confirmation is shown within 300 ms at p95>
        """
      And the output contains "next: fill in the rule and its scenario: Given the source and environment, When the stimulus, Then the response and its measure"

    Scenario: A decision starts as the sentence it must become
      When I run "sdp new decision 'Use Postgres'"
      Then the file "specs/decisions/DEC-use-postgres.feature" is:
        """
        @id=DEC-use-postgres
        Feature: Use Postgres

          Not <what a reasonable person would have chosen>, because <why>.
        """
      And the output contains "next: record a decision only for a choice that is hard to reverse, surprising without context and a real trade-off"

  Rule: Text a template wrote is flagged until it is filled in, once per spec, at the first

    A template writes text to replace in several places, and one finding is enough to send its
    author to the file.

    Scenario Outline: A rule, a scenario and a step as the template wrote them
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a
        Feature: Example

          Analysts export reports.

          Rule: <rule>

            Scenario: <scenario>
              Then <outcome>
        """
      When the workspace is checked
      Then sdp reports:
        | rule                 | node  | at                         | message   |
        | template-placeholder | REQ-a | specs/REQ-a.feature:<line> | <message> |

      Examples:
        | rule                        | scenario                | outcome              | line | message                                          |
        | <the rule, in one sentence> | <the main success case> | <observable outcome> | 6    | "Rule: <the rule, in one sentence>" (and 2 more) |
        | Reports are exported        | Export                  | <observable outcome> | 9    | "Then <observable outcome>"                      |

  Rule: new never overwrites, and never writes a spec that would not read back as written

    Scenario: An id or a file that exists
      Given these specs:
        | tags           | Feature |
        | @id=REQ-search | Search  |
      When I run "sdp new requirement Search"
      Then the exit code is 1
      And the output contains "id REQ-search already exists at specs/REQ-search.feature:1"
      Given a file "specs/requirements/REQ-carts.feature" containing:
        """
        Notes on carts, not a spec.
        """
      When I run "sdp new requirement Carts"
      Then the exit code is 1
      And the output contains "specs/requirements/REQ-carts.feature already exists"

    Scenario: An id that only a dangling link names is free: creating it resolves the link
      Given these specs:
        | tags                                     | Feature |
        | @id=REQ-filters @realized-by:ARCH-facets | Filters |
      When I run "sdp new element Facets"
      Then the output contains "ARCH-facets\tspecs/architecture/ARCH-facets.feature"
      When I run "sdp check"
      Then the exit code is 0

    Scenario Outline: A title reads back as written, however it looks
      Given specs created from the sdp new templates:
        | kind        | title   |
        | requirement | <title> |
      When the workspace is checked
      Then sdp reports nothing
      And node "<id>" has attribute title = "<title>"

      Examples:
        | title                | id                      |
        | Checkout: guest flow | REQ-checkout-guest-flow |
        | Cart #2              | REQ-cart-2              |
        | 'Quoted' carts       | REQ-quoted-carts        |
        | true                 | REQ-true                |
        | 2026-11-12           | REQ-2026-11-12          |
        | [draft] Wishlist     | REQ-draft-wishlist      |
        | - Returns            | REQ-returns             |
        | @team: Invoices      | REQ-team-invoices       |

    Scenario: An id that would not read back
      When I run "sdp new requirement Carts --id ' '"
      Then the exit code is 1
      And the output contains "would not read back"
