# Advice: prose and specs

`review/redesign` at `87f4716`. Nothing in the repository was changed. The two rewritten specs were
run in a scratch copy: `sdp check` clean, their 26 scenarios pass, the whole suite passes (345
scenarios; the gates stand as on the branch).
Line counts are mine: non-blank prose lines, with front matter, headings, tables and fences left out.

## Recommendation

Treat every paragraph as either source or a hand-kept view, and delete the views. That removes
roughly four fifths of the prose in the verified specs, the glossary, the architecture narrative
and most of AGENTS.md, and it lets `docs/` go: what is left in it is specs, which move to `specs/`.
What stays as prose is what no state of the repository can make false — reasons, intent, fears —
plus the few lines a reader needs before the first command. sdp should push this with six defaults
and no prose check.

The claims behind that:

1. **A document is a view that someone maintains by hand.** Nearly every unnecessary paragraph here
   is one: it restates scenario names, links, code comments or `--help`. Delete the view. Where no
   command prints it yet, that is the product gap. What is written by hand is only source: rules
   (a scenario's name and its examples), relations (links), reasons (decisions), intent (one
   paragraph) and fears (risks, open questions).
2. **`docs/` can disappear, and should.** Nothing in it is irreducibly a document. Move what earns
   its place to one tree, `specs/`, and let `sdp new` write there; delete the glossary and the
   overview's narrative. Outside the graph remain exactly four things: the skill, the product's
   own words (`--help`, hints, notes), code comments and git history.
3. **"Virtually" carries weight in five places**: reasons and rejected options; claims about the
   world outside the repository (vision, risks); specs ahead of the code (an idea or a draft is
   prose by nature, so a living product always has a prose frontier); the few lines a reader
   needs before they can run the first command; and the reader who has no terminal.
4. **The verified specs have not shed their design narrative.** The 16 verified requirements carry
   599 prose lines and about 160 lines of tables that restate their own 4,226 lines of scenarios.
   The fix is a writing rule, not a check: *a scenario's name is the rule it pins; when a sentence becomes a
   scenario, delete the sentence.* In the worked example REQ-graph-query goes from 41 prose lines
   to 5 and ARCH-query-engine from 27 to 6 with no rule lost, and
   `sdp q 'scenario[spec=REQ-graph-query]'` prints the reference page with a status per rule.
5. **The product nudges with defaults and reading order, never with a prose diagnostic.** Six
   small changes, listed below.

## Why I am confident the prose is a copy: it has already drifted

Found in a corpus that just had a pass over it:

- `docs/architecture/overview.md:114` points to "[[VISION]], *Finding your way*". No such section exists.
- `ARCH-spec-parser`'s `Code:` line omits `src/parse/StepDefinitions.ts`, which is annotated `is ARCH-spec-parser`.
- The overview says an element with its own file "specifies its contract there, as scenarios". `ARCH-runner` and `ARCH-vocabulary` have none.
- The glossary says "Nothing else is called a gate". `ARCH-spec-parser:44`, `REQ-agent-context:20`, `REQ-check-rules:46`, `src/parse/Spec.ts:47`, `src/graph/Context.ts:174` and the `ready` template say "the draft gate", "the ready gate". The glossary's guard greps for other words and passes.
- The query language is described five times: REQ-graph-query's prose, ARCH-query-engine's bullets, the header comment of `src/graph/Query.ts`, the `querySyntax` constant behind `--help`, and the skill. "Architects declare, sdp never computes" is restated in 9 files, "rebuilt on every command" in 9.
- `template-placeholder` keeps its own copy of each template's first line. The element template's has a comma where the copy has a full stop, so `sdp new element` output is never flagged.
- DESIGN-BRIEF's working rule is the cost, stated: "change every spec that describes it in the same commit: requirement, element contract, glossary term, decision".

## The line

| Content | Can it be false? | Home | Carrier |
| --- | --- | --- | --- |
| what the product must do | yes | spec | scenario: its name is the rule, its steps or examples pin it |
| what relates to what, and how much | yes | spec | link, attribute |
| how it is built | yes | code | JSDoc on the anchored declaration (already the `doc` of all 35 code nodes) |
| how to use the product | yes | product | `--help`, hints, notes, `sdp vocabulary` — pinned by a scenario |
| overview, module map, plan, status, glossary, traceability | — | nowhere: derived | `sdp arch`, `lifecycle`, `status`, `vocabulary`, `q`, `context` |
| why this and not that | no | decision | prose: the choice, the rejected options that someone would propose again |
| who wants it, and why | no | first paragraph of the spec | prose, three sentences at most |
| what we fear or do not know | no | risk, open question | prose plus links |
| what to read before the first command | no | README, AGENTS.md, skill | prose |

**What cannot be a spec** is what no state of the repository can make false: a reason, an intent,
a fear, a rejected alternative. That is the irreducible prose, and it is small. A *rule* is
irreducible too — examples never state the rule they pin — but it does not need a paragraph: it is
the scenario's name. Names (titles, scenario names, relation names) are the highest-value prose in
the repository; "no docs" does not mean "no natural language".

**The test for a paragraph**, in order:

1. *Is it a view?* Could a command print it from links, scenario names or code comments? Delete it.
2. *Can the repository make it false?* Then it is structure: a relation or value becomes a link
   or attribute; behaviour becomes a scenario named by the sentence; code layout becomes an
   annotation or JSDoc; usage becomes `--help` or a hint.
3. *It cannot be false.* Would a reader who has the scenarios, the graph and the code decide worse
   without it? Keep it, short, in its home (decision, first paragraph, risk). Otherwise delete it.

**Against the hard cases:**

- *Vision.* Problem, audience and positioning are claims about the world: prose, kept. The
  principles are stated twice (six nodes, then a numbered list) and each mirrors a decision title:
  keep the nodes, delete the list.
- *Architecture overview.* A view. `sdp arch` and `sdp graph --mermaid` print it; the module table
  is `sdp q 'element <-is- code'` plus `doc`. What remains is a spec: seven inline elements and
  four rules that can fail.
- *The diagram.* A hand-drawn picture is prose in another medium; it already names boxes that are
  not elements ("Use cases", "Code annotation scanner"). It is the picture of PAT-pipes-and-filters,
  whose body is the same pipeline as an ASCII arrow. Keep one, there, or none.
- *Glossary.* A view of the vocabulary plus restated summaries. No link reaches it (two mentions).
  Delete once `sdp vocabulary` prints the derived attributes.
- *Risks.* A prediction cannot be executed. The structure is already there (`affects`,
  `mitigated-by`, `due`, `status`); 7–10 lines of prose each is right.
- *Patterns.* Two to six lines. Right.
- *Agent guide.* A prompt: prose by nature. But there are three (AGENTS.md, the skill, the `sdp
  init` template) saying the same thing to the same reader. One generic text, plus what is
  specific to this repository.
- *README.* The model: a guide whose every claim runs. Keep.

## Verdict per document

| File | Verdict | Prose now → then | What goes, and what replaces it |
| --- | --- | --- | --- |
| `README.md` | keep | 28 → 28 | Nothing. Only its links follow the folder move. |
| `AGENTS.md` | shrink to the bootstrap | 62 + 11 scenarios → ~18 + 1 | Delete *Find things* (all of it is the skill's "Go through the graph first"; "every command, flag and exit code" is `sdp --help`), steps 1–3 of *Change behaviour* and the gates paragraph (skill), *Plan work* (move its three lines to the skill), and the conventions the skill states (claims as links, code linked to the architecture, architects' call, `results.json`). Keep: `sdp` is `node src/cli/main.ts`; step definitions live in `specs/steps/*.steps.ts` with one world; `npm run verify`, `npm run types`; Node 24 erasable syntax; Effect 4; the vocabulary is asked, never compared; DEC-0016. Delete 10 of 11 scenarios: each re-runs a command REQ-cli already pins (one asserts column spacing, `"anchor             is"`), and the 30-line gate scenario repeats REQ-cli's `sdp gate` section. Keep one, moved from the glossary: "a replaced word does not come back", widened to `(draft\|specified\|ready).? gate`. |
| `.claude/skills/sdp/SKILL.md` | keep; make it the one generic guide | 56 → ~60 | Add planning (`iteration:`, `activity:`, three lines). `sdp init` writes this text; `agentsTemplate` in `src/app/Templates.ts` goes. It is the one document outside the graph, because its reader is outside the workspace. |
| `docs/GLOSSARY.md` | delete | 8 + 41 rows → 0 | Interpreted words and derived attributes: `sdp vocabulary`. Definitions: the first paragraph of the spec each row already links to. The five repository conventions: a YAML comment where the attribute is written. Scenario 1 exists only to keep the table in step with the tool, and goes with it; scenario 2 moves to AGENTS.md. If a registry of "one word for one thing" is wanted, keep ten rows: only the words that are confused (link/relation/mention, maturity/verification/stage/status, gate/guard, undefined/pending). |
| `docs/VISION.md` | move to `specs/`, shrink | 37 → ~18 | Delete the numbered *Principles* list (lines 65–79): make each principle node's `title` the sentence. Delete lines 81–82 (restates the scenario) and *Capabilities* (84–87; `sdp context VISION` lists them). Keep the summary, *The problem*, *Who it is for*, *Positioning*. Scenario: drop `[scenarios>=1]` (see "too far"). |
| `docs/architecture/overview.md` | move, shrink to the rules | 23 + 16 rows → ~5 | Keep the front matter and the four scenarios. Diagram → PAT-pipes-and-filters. Delete lines 60–65 (restates DEC-0008; one claim is false). *What `uses` means* (10 lines) → two sentences: what a use is, and that type-only imports are none; the rest is the scenario's name. Delete *Implementation*: the module table, the Effect paragraph (DEC-0004), line 114. The two table cells that are not a view are open questions; write them as such: "Does `src/app/` get an element of its own?", "`src/model/Results.ts` belongs to no element". |
| `ARCH-code-annotations.md` | move, convert | 58 → ~8 | Keep the summary and the two syntax blocks. Delete the 14 bullets: 17 scenarios already carry them as names ("The target is a declaration at the top of the module", "A name declared again in an enclosing scope is not the import"). A bullet no scenario pins ("No run-time cost") becomes a scenario or goes. Delete `Code:`. |
| `ARCH-graph-builder.md` | move, convert | 8 + 11 rows → ~5 | Delete the *Source / Becomes* table: its rows are the eight scenario names. A row without a scenario becomes one or goes. Delete `Code:`. |
| `ARCH-graph.md` | move, keep | 8 → 7 | Delete `Code:`. |
| `ARCH-query-engine.md` | move, convert | 27 → 6 | Rewritten below. |
| `ARCH-runner.md` | move, shrink | 8 + 6 rows → ~4 | Delete the module table (annotations plus JSDoc) and the last paragraph (DEC-0011's guard and the `uses` check say it). Keep what it is and why it is architecture. |
| `ARCH-spec-parser.md` | move, convert | 52 → ~8 | Delete *Markdown*, *Gherkin* and *Diagnostics* (lines 22–75): 23 scenarios carry them ("Front matter is JSON data", "The scenario hash covers executable content only"). Delete `Code:`. |
| `ARCH-vocabulary.md` | move, keep | 11 → ~8 | Delete `Code:`. |
| `PAT-derived-index.md` | move, shrink | 6 → 3 | Lines 12–15 are DEC-0003's decision, which it links: one sentence. Keep why it is a pattern. |
| `PAT-pipes-and-filters.md` | move, keep | 3 → 3 | Receives the one diagram. No `patterns/` subfolder for two files. |
| `DEC-0001` … `DEC-0018` | move; the decisions advisor's call | 15–44 each | From my line: a decision is the home of the reasons, so it should hold what REQ and ARCH prose shed, and stop restating behaviour. `## Decision` is one sentence plus a link to the spec that specifies it (DEC-0001's eight lines restate REQ-progressive-specs; DEC-0011's table restates REQ-executable-specs). Options stay only where someone would propose them again. |
| `docs/delivery/plan.md` | move, keep | 12 → 12 | Data, plus why each phase takes what it takes. Right. |
| `MS-LCO`, `MS-LCA`, `MS-IOC`, `MS-PR` | move, shrink | 2–4 → 0–1 | Each opening paragraph lists its own scenario names. Delete it; keep only a reason (MS-LCA: "which elements, and how many, is the architects' call"). No `milestones/` subfolder for four files. |
| `RISK-0001` … `RISK-0008` | move, keep | 7–10 each | Right as they are. |

`specs/` in the same terms (verified requirements; drafts and ideas stay as they are — prose and
open questions are what those maturities are for; capabilities and quality requirements are
already right, except the tutorial sentence at `NFR-no-build-step:22`):

| Spec | Prose (+ table lines) | What goes |
| --- | --- | --- |
| REQ-cli | 139 (+15) → ~30 | Each command's paragraph restates `sdp <command> --help` and the scenarios under the same heading: one line per command at most. The exit code table becomes the Examples of one outline. |
| REQ-executable-specs | 118 (+40) → ~20 | Lines 23–235 are a manual that mirrors the scenario groups below it heading for heading (*Evidence*, *Step definitions*, *Runs*, *Gates*). Delete the mirror; status and roll-up tables become Examples. Keep what `verified` promises. |
| REQ-graph-query | 41 → 5 | Rewritten below. |
| REQ-lifecycle-view | 39 (+8) → ~8 | The four bold paragraphs are rule lists: scenario names. |
| REQ-builtin-steps | 32 (+11) → ~6 | The step table is `sdp steps`. The "must not pass for the wrong reason" list: scenario names. |
| REQ-progressive-specs | 31 → ~8 | Keep the annotated example file (the format shown, not described). Delete the bullets that describe it again (59–89). |
| REQ-maturity-criteria | 30 (+6) → ~10 | The criteria table is the Examples of an outline; *Stage* restates the outline that exists; the POL example repeats a fixture below. Keep *Structural, not a judgement*. |
| REQ-agent-context | 29 → ~5 | The nine-item list is the bundle's own section headings. |
| REQ-mcp-server | 29 (+11) → ~8 | The tool table is the tool descriptions the server serves. |
| REQ-configuration | 21 (+34) → ~8 | The key table is the commented defaults `sdp init` writes; the vocabulary, prefix and discipline tables are `sdp vocabulary`. |
| REQ-check-rules | 14 (+25) → ~6 | The 23-row catalogue repeats the outline's Examples (rule, severity, smallest breaking workspace) and the hints the tool prints. |
| REQ-graph-export, -curated-architecture, -decision-records, -flexible-graph, -quality-scenarios | 9–19 → 4–6 | Keep the first paragraph. |

## The end state: no `docs/`

**The design.** One tree, and a folder name that stops teaching "these are documents":

```text
README.md  AGENTS.md
specs/
  VISION.md
  capabilities/  requirements/  quality/
  architecture/   ARCHITECTURE.md  ARCH-*.md  PAT-*.md
  decisions/      delivery/ (PLAN.md, MS-*.md)      risks/
  steps/
```

`sdp new` writes decisions, elements, patterns, milestones, plans and risks to `docs/` today; that
default is what every new workspace learns first. With it gone, a `docs/` folder in someone's
workspace means what it says — a user manual, a deliverable — and is none of sdp's business. That is the scope of the
north star: sdp removes *delivery* documentation, not a product's own manual.

**What the tool must provide** — each document a team would otherwise write, and its replacement:

| Document | Replaced by | Gap |
| --- | --- | --- |
| "how X works", the requirements spec | the scenario names of X with their status | `sdp context` shows them after the spec text (300 lines for REQ-graph-query); lead with them |
| architecture overview, module map | `sdp arch`, `sdp graph --mermaid`, `sdp q 'element <-is- code'` | seven elements have no description; show the anchor's `doc` |
| reference manual | `--help`, hints, notes | none |
| glossary | `sdp vocabulary`; `sdp status` counts the kinds and relations in use | derived attributes are not printed |
| plan, status report, traceability matrix | `sdp lifecycle`, `sdp status`, `sdp q` | none |
| design document | decision (why) + element scenarios (contract) + JSDoc (how) | none |
| onboarding | README, which runs; the skill | two generic guides instead of one |
| a page for the reader without a terminal | the spec file as GitHub renders it | real — see below |

**Where "virtually" carries weight:**

1. *Reasons.* Decisions stay prose. Nothing can check why.
2. *The world outside.* The vision's problem and audience, a risk's threat. No scenario observes a market.
3. *The frontier.* Eight of 24 requirements here are ideas or drafts: prose and questions. Value
   moves into scenarios as they mature, and new prose arrives behind it. The claim holds per spec
   after implementation, never for the repository as a whole.
4. *The bootstrap.* README's *Try it*, AGENTS.md's 18 lines, the skill.
5. *The reader without a terminal.* A verified spec becomes nine tenths Gherkin, fixtures included. A product
   owner on GitHub reads monospace. Scenario names that are sentences make this bearable; a
   rendered view (REQ-web-explorer, still a draft) makes it good. Until then this is the
   honest cost.

## The spec's lifecycle

All 16 `ready` requirements are verified. They read as a manual followed by its tests: prose and
tables state every rule, then scenarios pin it, often under the same heading. The prose was the
design; after implementation it is a second copy that must be edited in step. Element specs read
the same way (172 prose lines and 17 table rows in seven files).

What a spec holds at each maturity:

| Maturity | Outside the fences | Inside |
| --- | --- | --- |
| idea | a title, a sentence | — |
| draft | who wants what and why; open questions; candidate rules as a list | — |
| specified | the intent paragraph | each candidate rule is now a scenario's name, with an example |
| ready | the same; no open question | every scenario states an outcome |
| verified (derived) | intent in three sentences, a formal notation if there is one | the contract |

The shedding happens once, between draft and specified: **promote, do not copy**. The sentence
becomes the scenario's name and leaves the prose in the same commit. A reason that does not fit a
name goes to the decision the spec links (`decided-by`), not to a paragraph; a "see also" with a
reason is a link (REQ-graph-query's mention of DEC-0010 is one, and becomes `decided-by` below).

Should sdp help? A convention in the skill and two defaults (templates, reading order). No check:
sdp cannot tell a reason from a restatement, and a prose budget is met by moving paragraphs into
Gherkin descriptions.

Costs I accept in the rewrite: Gherkin grows (194 → 275 lines, because one 32-row outline became
seven named ones); `[[ID]]` inside a fence is not a mention, so cross-references must be links;
scenario ids, cut at 64 characters, get long, and rewording a rule renames its scenario.

## Worked example

### `specs/requirements/REQ-graph-query.md`

Gone: the six bullets (every clause is a row below), the stage-ladder sentence (pinned in
REQ-maturity-criteria), the example queries (`sdp q --help` prints them), the pointer to limits
(ARCH-query-engine, reached by `realized-by`). New rows pin three claims that had none: an unknown
kind, relation and attribute match nothing; `kind` is a key; a condition and a filter agree.

`````markdown
---
id: REQ-graph-query
kind: requirement
title: Path-pattern queries
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [graph, agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-query-engine
  decided-by: [DEC-0006, DEC-0010]
  constrained-by: NFR-query-performance
---

# Path-pattern queries

People and agents ask the graph a question in one line — on the command line, over MCP and inside
scenarios, which is how gates, guards and architecture rules are written. The syntax is a public
contract, because specs in every workspace embed it.

```text
query  := node (edge node)* [edge]
node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
cond   := key | !key | key=v(|v)* | key!=v(|v)* | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
```

A query returns nodes or paths and nothing more: counting and grouping are jq's
([[REQ-graph-export]]).

## Scenarios

~~~gherkin
Background:
  Given a file "model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: REQ-checkout, kind: requirement, maturity: ready, tags: [checkout, web], due: "2026-12-01", links: { realized-by: ARCH-orders } }
      - { id: REQ-refunds, kind: requirement, maturity: idea, estimate: 8, due: "2027-03-01", links: { realized-by: ARCH-billing } }
      - { id: ARCH-orders, kind: element, title: "Order service, v2", public: true, links: { depends-on: ARCH-billing } }
      - { id: ARCH-billing, kind: element, title: Billing, public: false, links: { depends-on: ARCH-ledger } }
      - { id: ARCH-ledger, kind: element, title: "Ledger [legacy]", owner: { team: core }, links: { depends-on: ARCH-orders } }
    ---
    # Model

    Everything ends in the [[ARCH-ledger]].
    """

Scenario Outline: A selector names kinds, ids or every node
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                     | result                                                                   |
    | requirement\|element      | REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger        |
    | *                         | MODEL, REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
    | #ARCH-orders\|REQ-refunds | ARCH-orders, REQ-refunds                                                 |

Scenario Outline: A word the workspace does not know is no error: it matches nothing
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query               | result  |
    | #ARCH-unknown       | nothing |
    | gizmo               | nothing |
    | element -feeds-> *  | nothing |
    | element[colour=red] | nothing |

Scenario Outline: Every condition must hold, in one group or in several
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                        | result      |
    | element[public, title~order] | ARCH-orders |
    | element[public][title~order] | ARCH-orders |
    | #ARCH-orders[public]         | ARCH-orders |
    | #ARCH-billing[public]        | nothing     |

Scenario Outline: A bare key asks whether it is set; a comparison reads the value
  Given a file "flags.md" containing:
    """
    ---
    id: FLAGS
    kind: flags
    nodes:
      - { id: F-missing, kind: flag }
      - { id: F-null, kind: flag, value: null }
      - { id: F-false, kind: flag, value: false }
      - { id: F-zero, kind: flag, value: 0 }
      - { id: F-empty, kind: flag, value: "" }
      - { id: F-none, kind: flag, value: [] }
      - { id: F-true, kind: flag, value: true }
    ---
    # Flags
    """
  When I query '<query>'
  Then the result is "<result>"

  Examples: Missing, null, false, empty text and an empty list are not set
    | query        | result                                      |
    | flag[value]  | F-zero, F-true                              |
    | flag[!value] | F-missing, F-null, F-false, F-empty, F-none |

  Examples: = and ~ find false, zero and empty text; != also matches a node that has no value
    | query              | result                                             |
    | flag[value=false]  | F-false                                            |
    | flag[value!=false] | F-missing, F-null, F-zero, F-empty, F-none, F-true |
    | flag[value=0]      | F-zero                                             |
    | flag[value=""]     | F-empty                                            |
    | flag[value!=""]    | F-missing, F-null, F-false, F-zero, F-none, F-true |
    | flag[value=null]   | nothing                                            |
    | flag[value~^f]     | F-false                                            |
    | flag[value<1]      | F-zero                                             |

Scenario Outline: Case is ignored, and a list matches when any of its elements does
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                  | result       |
    | element[public=TRUE]   | ARCH-orders  |
    | element[title=BILLING] | ARCH-billing |
    | element[title~^bill]   | ARCH-billing |
    | requirement[tags=web]  | REQ-checkout |
    | requirement[tags!=web] | REQ-refunds  |

Scenario Outline: A bar separates alternatives, except in a regex or in quotes
  When I query '<query>'
  Then the result is "<result>"

  Examples:
    | query                               | result                    |
    | requirement[maturity=ready\|idea]   | REQ-checkout, REQ-refunds |
    | requirement[maturity!=ready\|draft] | REQ-refunds               |
    | element[title!~^(billing\|ledger)]  | ARCH-orders               |
    | element[title~^[bl]]                | ARCH-billing, ARCH-ledger |
    | element[title~\[legacy\]]           | ARCH-ledger               |
    | *[title="Order service, v2"]        | ARCH-orders               |
    | *[title~"service, v[0-9]"]          | ARCH-orders               |

Scenario Outline: Less and greater order values that are set
  When I query "<query>"
  Then the result is "<result>"

  Examples: Along the maturity ladder
    | query                       | result       |
    | requirement[maturity>idea]  | REQ-checkout |
    | requirement[maturity<=idea] | REQ-refunds  |

  Examples: Then as numbers; a node without the key is not compared
    | query                     | result      |
    | requirement[estimate>5]   | REQ-refunds |
    | requirement[estimate<100] | REQ-refunds |

  Examples: Then as text, so ISO dates order
    | query                        | result       |
    | requirement[due<2027-01-01]  | REQ-checkout |
    | requirement[due>=2027-03-01] | REQ-refunds  |

Scenario Outline: id, kind, title and source are keys, and a dot reaches into a nested attribute
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                | result                    |
    | *[id~^req-]          | REQ-checkout, REQ-refunds |
    | *[kind=model]        | MODEL                     |
    | *[source=model.md:7] | ARCH-orders               |
    | *[owner.team=core]   | ARCH-ledger               |

Scenario Outline: A key reads only what the node itself holds
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                      | result                                 |
    | element[toString]          | nothing                                |
    | element[owner.constructor] | nothing                                |
    | element[!constructor]      | ARCH-orders, ARCH-billing, ARCH-ledger |

Scenario Outline: A key also holds the targets of the node's links, so a condition and a filter agree
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                    | result       |
    | requirement[realized-by=ARCH-orders]     | REQ-checkout |
    | requirement ?-realized-by-> #ARCH-orders | REQ-checkout |
    | element[depends-on=ARCH-ledger]          | ARCH-billing |
    | element ?-depends-on-> #ARCH-ledger      | ARCH-billing |

Scenario Outline: An edge follows a relation out, in or both ways; at the end of a query it leads to any node
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                                | result                   |
    | #ARCH-billing -depends-on-> *                        | ARCH-ledger              |
    | #ARCH-billing <-depends-on- *                        | ARCH-orders              |
    | #ARCH-billing -depends-on- *                         | ARCH-ledger, ARCH-orders |
    | #ARCH-billing <-depends-on\|realized-by- *           | ARCH-orders, REQ-refunds |
    | #REQ-checkout -realized-by-> * -depends-on-> element | ARCH-billing             |
    | #REQ-checkout -realized-by->                         | ARCH-orders              |

Scenario Outline: A star or no name is any relation but a prose mention
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                   | result                                |
    | #ARCH-billing <-- *     | ARCH-orders, REQ-refunds              |
    | #ARCH-billing -*- *     | ARCH-ledger, ARCH-orders, REQ-refunds |
    | #ARCH-ledger <-*- *     | ARCH-billing                          |
    | #MODEL -*-> *           | nothing                               |
    | #MODEL -mentions-> *    | ARCH-ledger                           |
    | #MODEL -*\|mentions-> * | ARCH-ledger                           |

Scenario Outline: A plus is one or more hops, and reaches its start when a cycle leads back
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                       | result                                 |
    | #ARCH-orders -depends-on+-> *               | ARCH-billing, ARCH-ledger, ARCH-orders |
    | #ARCH-orders <-depends-on+- *               | ARCH-billing, ARCH-ledger, ARCH-orders |
    | #ARCH-orders -depends-on+-> #ARCH-orders    | ARCH-orders                            |
    | #REQ-checkout -realized-by+-> #REQ-checkout | nothing                                |

Scenario Outline: ? keeps the nodes with such a neighbour, ! those without, and neither moves
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                                        | result      |
    | element ?<-realized-by- requirement[maturity=ready]          | ARCH-orders |
    | element !<-realized-by- *                                    | ARCH-ledger |
    | element !-depends-on+-> #ARCH-orders                         | nothing     |
    | requirement ?-realized-by-> element[public] -realized-by-> * | ARCH-orders |

Scenario Outline: A malformed query is rejected with a reason
  When I query '<query>'
  Then the query is rejected with "<reason>"

  Examples:
    | query                                      | reason                   |
    |                                            | empty query              |
    | requirement]                               | unbalanced               |
    | *[title="open                              | unbalanced               |
    | requirement realized-by element            | expected an edge         |
    | requirement <-realized-by-> element        | expected an edge         |
    | requirement -realized-by-> -depends-on-> * | expected a node selector |
    | requirement[maturity=ready]x               | could not parse filters  |
    | requirement[=ready]                        | invalid condition        |
    | requirement[!maturity=ready]               | only negates bare keys   |
    | *[title~(]                                 | invalid regex            |

Rule: The result is the distinct end nodes; a path is a route that exists, each edge drawn as it points

  Background:
    Given a file "routes.md" containing:
      """
      ---
      id: ROUTES
      kind: model
      nodes:
        - { id: A, kind: stop, links: { r: B } }
        - { id: B, kind: stop, links: { r: A, s: C } }
        - { id: C, kind: stop }
      ---
      # Routes
      """

  Scenario: Several routes to a node are one result and as many paths
    When I query "requirement -realized-by-> element -depends-on+-> *"
    Then the result is "ARCH-billing, ARCH-ledger, ARCH-orders"
    And the paths are:
      | REQ-checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing                                                     |
      | REQ-checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing -depends-on-> ARCH-ledger                           |
      | REQ-checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders |
      | REQ-refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger                                                      |
      | REQ-refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders                            |
      | REQ-refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders -depends-on-> ARCH-billing |

  Scenario: An edge walked against its direction is drawn as it points
    When I query "#ARCH-ledger <-depends-on- element <-realized-by- *"
    Then the paths are:
      | ARCH-ledger <-depends-on- ARCH-billing <-realized-by- REQ-refunds |

  Scenario: Two edges between the same nodes are two routes, each in its direction
    When I query "#A -r- #B"
    Then the paths are:
      | A -r-> B |
      | A <-r- B |

  Scenario: A closure over several relations names the relation of each hop
    When I query "#A -r|s+-> #C"
    Then the paths are:
      | A -r-> B -s-> C |

  Scenario: A closure reaches its start through a cycle, by a route that says how
    When I query "#A -r+-> #A"
    Then the paths are:
      | A -r-> B -r-> A |
~~~
`````

### `specs/architecture/ARCH-query-engine.md`

Gone: *Parsing first* (REQ-graph-query's last outline), *A frontier of paths* (the algorithm: it
belongs in `src/graph/Query.ts`, whose header comment should describe that instead of repeating
the syntax a fifth time), *A path is a route that exists* (the requirement's rule), `Code:`. Kept:
what it is, and why it is architecture. The limits are the names of its rules.

`````markdown
---
id: ARCH-query-engine
kind: element
title: Query engine (SDPQ)
iteration: I1
links:
  decided-by: DEC-0006
  constrained-by: NFR-query-performance
  uses: ARCH-vocabulary
---

# Query engine (SDPQ)

Parses the path patterns of [[REQ-graph-query]] and evaluates them over the graph: a pure function
of a graph, a query and the workspace's ordering ladders.

It is architecture because gates, guards and agents' scripts in every workspace embed its syntax,
and because it must stay interactive on large graphs. So evaluation is bounded, and the bound is
part of the contract: a caller that concludes from a result refuses a truncated one
([[REQ-builtin-steps]], [[REQ-cli]], [[REQ-mcp-server]]).

## Scenarios

~~~gherkin
Rule: A plus walks breadth-first, at most 12 hops, and adds one path per node it reaches

  Scenario: A closure stops after twelve hops and says so
    Given a chain of 15 nodes linked by "next"
    When I query "#N1 -next+-> *"
    Then the result has 12 nodes
    And the result is truncated because "a + edge reaches further than 12 hops"

  Scenario: The path to a node a closure reaches is a shortest one
    Given a file "model.md" containing:
      """
      ---
      id: MODEL
      kind: model
      nodes:
        - { id: A, kind: stop, links: { next: [B, C] } }
        - { id: B, kind: stop, links: { next: D } }
        - { id: C, kind: stop, links: { next: D } }
        - { id: D, kind: stop, links: { next: A } }
      ---
      # Two routes from A to D, and a way back
      """
    When I query "#A -next+-> *"
    Then the paths are:
      | A -next-> B                     |
      | A -next-> C                     |
      | A -next-> B -next-> D           |
      | A -next-> B -next-> D -next-> A |

Rule: A step keeps at most 10 000 paths

  Scenario: The default path limit is 10 000 per step
    Given 25 nodes, each linked to all the others by "knows"
    When I query "member -knows-> member -knows-> member"
    Then the result has 25 nodes
    And the result is truncated because "a step has more than 10000 paths"

  Scenario: A caller may lower the limit
    Given a generated graph of 200 nodes and 12000 edges
    When the query "* -*-> * -*-> *" runs on it with at most 1000 paths
    Then the result has 1000 paths
    And the result is truncated because "a step has more than 1000 paths"

Rule: A result cut short says so and names the limit, unless the limit could not have changed it

  Scenario: An empty result cut short says so too
    Given a chain of 14 nodes linked by "next"
    When I query "#N1 -next+-> #N14"
    Then the result has 0 nodes
    And the result is truncated because "a + edge reaches further than 12 hops"

  Scenario Outline: A filter is cut short only when the limit leaves it undecided
    Given a chain of 15 nodes linked by "next"
    When I query "<query>"
    Then the result is "<result>"
    And the result is <completeness>

    Examples:
      | query              | result  | completeness |
      | #N1 ?-next+-> #N2  | N1      | complete     |
      | #N1 !-next+-> #N2  | nothing | complete     |
      | #N1 ?-next+-> #N15 | nothing | truncated    |
      | #N1 !-next+-> #N15 | N1      | truncated    |
~~~
`````

## What the product should do, smallest first

1. **Templates write only what should stay.** Three templates leave instructions in the user's
   graph that nothing flags: the plan template (a six-line how-to), the `ready` template ("None: a
   ready spec has no open questions left…") and, through the comma above, the element template
   (how to anchor code). Print guidance in the answer of `sdp new`, not in the file; then the
   check needs no copy of it.
2. **`sdp new` writes under `specs/`.** Six lines in `directoryFor`; here, a move and 111 paths.
3. **`sdp context` leads with the contract**: scenario names with their status, grouped by `Rule:`
   where there is one, before the spec text.
4. **An element without a description shows its anchor's `doc`** in `sdp arch` and the bundle.
5. **`sdp vocabulary` prints the derived attributes** it already holds.
6. **`sdp init` writes the skill's text.** One generic guide.

Not recommended: a prose diagnostic, a change to the maturity criteria (`draft` rightly asks for
a paragraph: intent is irreducible), or a new kind for anything above.

## Where the north star goes too far

- **Nodes nobody links to.** The 42 glossary terms were this. The vision's five audiences as
  `stakeholder` nodes would be the same. Structure earns its place by being linked or queried.
- **A scenario that keeps a hand copy in step with the tool** ("Every attribute sdp derives is
  listed here"). It can fail, but the right fix is to delete the copy.
- **A guard that restates a check.** `DEC-0001#all-gherkin-in-this-repository-parses` cannot be
  seen failing: `sdp run` refuses to start on `gherkin-syntax`. `DEC-0002#every-reference-resolves`
  is `dangling-link`, which fails `sdp check` first. VISION's `decision[scenarios>=1]` asks for
  exactly such guards.
- **A doc-test that re-pins another spec's behaviour** (AGENTS.md's ten).
- **A link added to derive a picture** (`feeds` between elements, for the pipeline diagram).
- **Volume.** Scenarios are not free: 5,770 lines of Gherkin, much of it fixtures. "Specs over
  prose" must not become "a scenario per branch"; the contract people read is the names.
- **Reasons as structure.** A `rationale:` attribute is a paragraph in YAML.

## Where this touches the other two advisors

- *Decisions.* I move reasons into decisions and behaviour out of them; if decisions shrink to a
  few sentences that still works, but the bundle's "what was decided — its `## Decision` section"
  needs the new shape. Principles mirror decision titles one to one in four of six cases: one of
  the two could carry both. The two guards above, and VISION's rule that asks for them, are theirs
  to keep or drop.
- *Milestones and releases.* Only the folder move, and the milestone paragraphs that list their
  own scenario names.

## Unsure — the owner's call

1. **Glossary: delete, or keep ten rows of confusable words.** I say delete; the cost is that
   "one word for one thing" then rests on one grep.
2. **Principles: nodes or prose.** Nodes are structure but duplicate decision titles; prose is
   honest about being a summary. I kept the nodes because a scenario reads them.
3. **The grammar block in REQ-graph-query.** It is the contract in four lines, and it duplicates
   `querySyntax`. I kept it; a scenario that `sdp q --help` prints it would settle which is source.
4. **A `prose` derived attribute** (words outside fences), so that "which verified specs still
   carry narrative" is a query and a team can gate on it. Useful to hold this corpus to the north
   star; but any threshold is arbitrary and easy to game. I would not ship a default rule.
5. **The reader without a terminal.** If product owners are to read verified specs on GitHub,
   group scenarios under Markdown headings (as REQ-cli does) and keep one sentence of intent per
   group; if they read `sdp context` or the explorer, do not.
6. **The diagram.** One hand-drawn picture, in the pattern, or none.
