@id=use-the-command-line
@realized-by:ARCH-cli @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-workspace
Feature: Use the command line

  People, scripts and agents run one command, `sdp`, and learn its conventions once: every
  subcommand keeps them, so what works with one works with the next.

  Not what each command answers: that belongs to the feature the command serves.

  Background:
    Given these specs:
      | tags                           | Feature |
      | @id=search @maturity=specified | Search  |
    And a file "specs/MS-beta.feature" containing:
      """
      @id=MS-beta
      Feature: Beta

        Rule: Every feature is ready

          Scenario: None is below ready
            Then the query "feature[maturity<ready]" returns no results
      """

  Rule: A command exits with 0 when it did what it was asked, and with 1 when it did not

    A script reads from the exit code whether a command did what it was asked, never from its
    wording.

    Scenario Outline: Done, and not done
      When I run "<command>"
      Then the exit code is <exit code>

      Examples:
        | command          | exit code |
        | sdp q feature    | 0         |
        | sdp gate MS-beta | 1         |

  Rule: Input a command cannot use is refused on stderr, a line for each fault, never a stack trace

    A person fixes what one line names, and a stack trace buries it.

    Scenario Outline: An id no node has, and a query sdp cannot read
      When I run "<command>"
      Then the exit code is 1
      And the output lines are "nothing"
      And the output is "<refusal>"

      Examples:
        | command          | refusal                                    |
        | sdp show carts   | no node carts                              |
        | sdp q 'feature[' | query error: unbalanced brackets or quotes |

  Rule: A command that refuses its input writes nothing

    One that wrote half of what it was asked would leave a workspace nobody wants.

    Scenario: A feature at a maturity off the ladder
      When I run "sdp new feature Carts --maturity implemented"
      Then the exit code is 1
      And the file "specs/features/carts.feature" does not exist

  Rule: A command line sdp cannot parse gets the command's help

    Whoever left out an argument or misspelt a flag is shown how the command is written.

    Scenario: An argument left out
      When I run "sdp show"
      Then the exit code is 1
      And the output lines include "USAGE, sdp show [flags] <id>"
      And the output contains "Missing required argument: id"

  Rule: An answer that may miss something says what was not read, apart from the answer, and exits with 2

    An agent must learn that an answer may miss something before it concludes that something is
    absent, and a pipe must read the answer and nothing else.

    Scenario: A spec that declares an id again
      Given a file "specs/twin.feature" containing:
        """
        @id=search
        Feature: Search again
        """
      When I run "sdp q feature --ids"
      Then the exit code is 2
      And the output contains "note: not read: specs/twin.feature:1 [duplicate-id]"
      And the output lines are "search"
      When I run "sdp q feature --json"
      Then the exit code is 2
      And the JSON output has:
        | complete   | false  |
        | data.nodes | search |

  Rule: An answer is text for a person by default, and with --json the same answer as data for a program

    A person reads lines and a program reads fields: each gets the answer in its own form, so
    neither has to parse the other's.

    Scenario Outline: One answer as text and as data
      When I run "<command>"
      Then the exit code is 0
      And the output line with "<about>" contains "<text>"
      When I run "<command> --json"
      Then the exit code is 0
      And the JSON output has:
        | <field> | <value> |

      Examples:
        | command         | about      | text                          | field                    | value                         |
        | sdp show search | maturity:  | specified                     | data.node.attrs.maturity | specified                     |
        | sdp status      | milestones | open 1                        | data.milestones.open     | 1                             |
        | sdp vocabulary  | maturity   | idea, draft, specified, ready | data.vocabulary.maturity | idea, draft, specified, ready |

  Rule: A command works on the workspace -C names, or else the nearest at or above the current directory

    As git finds its repository: a command run anywhere inside a workspace answers about all of
    it, and a script outside one names the one it means.

    Scenario: From a subdirectory
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp q feature --json" in "specs"
      Then the exit code is 0
      And the JSON output has:
        | data.nodes.file | specs/search.feature |

    Scenario: Another workspace, named with -C
      Given a file "shop/sdp.config.yaml" containing:
        """
        # every key at its default
        """
      And a file "shop/specs/cart.feature" containing:
        """
        @id=cart @maturity=idea
        Feature: Cart
        """
      When I run "sdp -C shop q feature --ids"
      Then the exit code is 0
      And the output lines are "cart"

    Scenario Outline: -C that names no directory
      When I run "sdp -C <path> q feature"
      Then the exit code is 1
      And the output line with "<refusal>" contains "<path>"

      Examples:
        | path                 | refusal                    |
        | specs/search.feature | a workspace is a directory |
        | nowhere              | no such directory          |

  Rule: A reader that stops early is no error: the command exits with 0 unless it had already failed

    `sdp … | head` stops reading on purpose, and a script that pipes sdp must not take that for sdp
    failing, nor be shown a stack trace.

    Scenario: A run read only to its first line
      Given a generated workspace of 100 specs
      When I run the pipeline:
        """
        { { sdp run; echo "sdp exited with $?" >&3; } | head -n 1 > /dev/null; } 3>&1
        """
      Then the exit code is 0
      And the output lines are "sdp exited with 0"
      And the output does not contain "EPIPE"

  @maturity=ready @replaces:use-the-command-line#a-reader-that-stops-early-is-no-error-the-command-exits-with-0
  Rule: A reader that stops early is no error: a command that reads ends there, and a run runs to its end

    A reader that stops is no Ctrl-C. A command that only reads exits with 0 unless it had already
    failed; a run has results to record, so it records them, writes no more, and exits as its
    scenarios say, those after the reader stopped too.

  Rule: status counts on one screen what the graph holds, each by where it stands

    The first question in a repository one has not seen is how much it holds and how much of that
    works.

    Scenario: The counts, as data
      When I run "sdp status --json"
      Then the exit code is 0
      And the JSON output has:
        | data.kinds.feature    | 1 |
        | data.stages.specified | 1 |
        | data.gates.unrun      | 1 |
        | data.milestones.open  | 1 |
