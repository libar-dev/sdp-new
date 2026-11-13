@id=specs-are-written-one-way @kind=guide
Feature: A spec of this repository is written one way

  What every spec here keeps to, whatever it is about, so that a reader and grep find one thing in
  one form.

  Rule: AGENTS.md holds only what no scenario can check, in at most 40 lines

    It is the easiest place to write, so it grows. What a scenario can check is a rule of a guide
    spec, and how to work in any repository that uses sdp is the skill.

    Scenario: The length of AGENTS.md
      When I run "sh -c 'test $(wc -l < AGENTS.md) -le 40'" in the repository
      Then the exit code is 0

  Rule: In this repository a word means one thing, and so does an id's prefix

    So grep finds a thing under one name, and an id says what kind of thing it is.

    Scenario: A word this repository replaced does not come back
      When I run "grep -rnE '[Mm]aturity gates?|NFR[s]|(draft|specified|ready).? gate|@kind=chang[e]|@change[s]:|incomin[g]/|maturity=implemente[d]|maturity-(criteri[a]|promotabl[e]|missin[g]|valu[e])|retired-maturit[y]|verificatio[n][^-a-z]|\[annotatio[n]\]|[|] annotatio[n] +[|]|Annotations are not tag[s]' README.md AGENTS.md .claude specs src examples" in the repository
      Then the exit code is 1

    Scenario Outline: An id with a prefix is of that prefix's kind, and the other way round
      Then every node matching "*[id~^<prefix>-[^#]*$]" also matches "<kind>"
      And every node matching "<kind>" also matches "*[id~^<prefix>-]"

      Examples:
        | prefix | kind        |
        | ARCH   | element     |
        | PAT    | pattern     |
        | MS     | milestone   |
        | IT     | iteration   |

  Rule: A spec is a feature file; Markdown is only for the pages sdp does not read

    A rule written in Markdown is in no graph, no run and no check, so it counts for nothing. What
    counts is what the repository holds: a working note nobody committed is no page of it.

    Scenario: The Markdown files of this repository, the example's included
      When I run "git ls-files '*.md'" in the repository
      Then the output lines are "README.md, AGENTS.md, CLAUDE.md, .claude/skills/sdp/SKILL.md, examples/shop/README.md, scripts/orient/README.md"

  @maturity=ready
  Rule: A table cell holds one line, and a case that needs a file of several lines is a scenario of its own, the file its docstring

    A file escaped into one cell does not read as the example it is: as a docstring it reads as the
    file it is, and the scenario's name says the case.

    Scenario: The table cells of this repository's specs that hold a line break
      When I run "find specs -name '*.feature' -exec awk '/^[[:space:]]*\|/ { gsub(/\\\\|\\\|/, 0); n += gsub(/\|[^|]*\\n/, 0) } END { print n + 0 }' {} +" in the repository
      Then the output lines are "0"

