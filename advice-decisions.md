# Advice: decisions in sdp

Read at `87f4716`, the commit `review/redesign` points at. Nothing in the repository was changed.
The form proposed below was tried against today's `sdp` in a scratch workspace.

## Recommendation

A decision holds one thing that no executable spec can: what was chosen *over*, and why. That is
one sentence. Every other part of a decision record already has a structured or executable place
in this graph, so the record should hold nothing else.

The design I propose:

1. **A decision is a title and one to three sentences, usually one.** The title states the
   choice. The sentence says what it was chosen over and why. No sections, no scenarios, no
   `status`, `category`, `date` or `deciders`.
2. **It is in force because the file exists.** What is undecided is an open question on the spec
   it blocks, which `ready` already refuses. What changed is rewritten, and git keeps the rest.
3. **Its rules are scenarios on what it constrains**, which links back with `decided-by`. **Its
   price is a risk.**
4. **Most choices never become a record.** A choice that concerns one spec is a sentence there,
   or a resolved open question. A record is for a choice that is hard to reverse, surprising
   without context and a real trade-off.
5. **It stays a node**, and sdp interprets only its kind.

For this codebase that is **ten decisions and about fifteen sentences**, in place of eighteen
records and 1080 lines. Six of the eighteen restate a rule that a requirement or an element
already states and tests; two are clauses of a decision that stays.

## What survives when there are no docs

| An ADR's part | In sdp it already is | Checked by |
| --- | --- | --- |
| Context, forces | links to the quality requirements and requirements that drove it | `dangling-link` |
| Proposed, open | an open question on the spec it blocks | `maturity-criteria`: `ready` refuses it |
| The decision itself | the requirement, element or pattern that embodies it | its scenarios |
| Consequences that are behaviour | scenarios on what it constrains | `sdp run` |
| Consequences that are costs | a risk: what it threatens, what retires it, by which milestone | the milestone gates |
| Date, deciders, history, superseded | git | |
| **What it was chosen over, and why** | **nothing** | nothing can |

Three facts from this repository support the table:

- **Undecided things are already open questions.** There are 25 open questions on nine specs and
  not one `proposed` decision. REQ-shared-evidence's five questions are the open half of DEC-0011.
- **Prices are already risks.** Six of the eight risks cite the decision they are the price of
  (RISK-0003 is the price of DEC-0003, RISK-0008 of DEC-0004), and each decision then says it
  again under Consequences.
- **Local choices are already resolved questions.** REQ-npm-package, line 30, is DEC-0012 in one
  line.

A scenario can say what must be true. It cannot say what we chose not to do: "the next command
sees an edit" tests DEC-0003 and tells nobody not to add a cache. The test for whether a sentence
earns a record: delete it. If an informed newcomer reading the specs would propose the rejected
alternative again, it was a decision. If they would simply follow the rule, it was documentation.

## 1. The eighteen

H: hard to reverse. S: surprising without context. T: a real trade-off.

| DEC | Decides | H | S | T | Verdict | Reason, and where it goes |
| --- | --- | --- | --- | --- | --- | --- |
| 0001 | Markdown with fenced Gherkin is the one format | yes | yes | yes | **Keep** | Every spec in every workspace depends on it, and a newcomer expects `.feature` files. |
| 0002 | Free-form kinds and relations; interpreted words in one profile | yes | yes | yes | **Keep** | An architecture tool without a metamodel owes its reason. The profile's mechanics are ARCH-vocabulary's contract. |
| 0003 | Files are the truth; the graph is rebuilt on every command | yes | yes | yes | **Keep** | The textbook case: no database, no cache. Nine nodes rest on it. |
| 0004 | TypeScript on Effect 4 and Node.js 24 | yes | yes | yes | **Keep**, absorbs 0012 | Technology with lock-in; Effect 4 is the surprising part. |
| 0005 | Maturity declared and checked; stage derived | yes | yes | yes | **Keep** | "Why can I not write `stage: verified`?" is what every newcomer asks. |
| 0006 | SDPQ, a one-line path-pattern language | yes | yes | yes | **Keep** | An own query language instead of jq or Cypher, embedded in specs everywhere. |
| 0007 | Risk-driven phases closed by milestones whose gates are scenarios | yes | yes | yes | **Keep**, absorbs one clause of 0015 | Shapes the lifecycle view and this plan; a backlog is the expected default. |
| 0008 | The architecture is what architects declare | yes | yes | yes | **Keep** | The product's position. Other tools harvest, and an agent will too unless told. |
| 0009 | Annotations are typed code | yes | yes | yes | **Keep** | Adopters' production code imports `sdp/annotations`; "why not a comment or a decorator" needs its answer. |
| 0010 | A link is a property of the key | yes | no | weak | **Demote** to ARCH-graph-builder | Once stated it is the rule anyone would assume. The builder's table, REQ-flexible-graph and the glossary state it and a scenario enforces it. Borderline. |
| 0011 | Evidence: coarse fingerprints, two layers | partly | yes | yes | **Keep** | "Any code change makes every result stale" and "gates cannot read gates" are what someone will try to fix. The fingerprint table already lives in REQ-executable-specs. |
| 0012 | Source runs in development; a release is built | no | weak | weak | **Merge** into 0004 | A consequence of Node.js 24 and easy to undo. The rule is NFR-no-build-step; REQ-npm-package holds the rest as a resolved question. |
| 0013 | Activity is planned on the work | partly | no | weak | **Demote** to REQ-lifecycle-view | The requirement states both keys in full; nobody reading it wonders why. |
| 0014 | Gates report always; only due ones are enforced | no | weak | yes | **Demote** to REQ-cli | REQ-cli states it with its reason. Nothing links to the record with `decided-by`. |
| 0015 | A risk is retired by evidence | no | weak | yes | **Merge** one clause into 0007 | It is the shape of a risk in this repository: four scenarios that belong to the plan, and a line AGENTS.md already has. |
| 0016 | In Inception a decision is rewritten | no | no | weak | **Demote**; it dissolves | With no status there is nothing to supersede: a decision is always rewritten. |
| 0017 | A scenario is identified by a slug of its name | yes | no | weak | **Demote** to ARCH-spec-parser | The parser's contract, stated there in one line. "Recorded afterwards"; nothing links to it. |
| 0018 | The id prefix says the kind | partly | no | no | **Demote** to REQ-configuration | Stated and tested there. "Recorded afterwards"; nothing links to it. |

Ten keep, two merge, six demote. A demoted record is deleted as a file, because its content
already lives where it is demoted to. A reason the owning spec lacks moves there as one sentence,
for example 0014's "the same commit would pass today and fail tomorrow" into REQ-cli.

**The right number is ten.** I would not manage it as a target. One query tells most non-decisions
apart: a decision nothing links to with `decided-by` (0014, 0016, 0017, 0018 today).

### Where the twenty guard scenarios go

Fourteen records carry twenty scenarios. None tests a choice; each tests a rule.

| Scenarios | From | To |
| --- | --- | --- |
| 5 | 0001, 0002 (references resolve), 0005, 0011, 0016 | deleted: `gherkin-syntax`, `dangling-link` and `derived-attribute` are already check errors, the overview's `uses` scenario already forbids the import, and 0016's goes with the statuses |
| 2 | 0002 (the vocabulary guard and its self-test) | ARCH-vocabulary |
| 1 | 0003 | PAT-derived-index |
| 1 | 0004 (the core does no IO) | PAT-pipes-and-filters, which states exactly that |
| 6 | 0007, 0013, 0015 | PLAN |
| 1 | 0008 | REQ-curated-architecture |
| 2 | 0009 | the architecture overview |
| 1 | 0010 | ARCH-graph-builder |
| 1 | 0018 | AGENTS.md, which states the claim in prose today |

## The form

Three in full. Each is the whole file.

```markdown
---
id: DEC-0003
---

# Files are the source of truth; every command rebuilds the graph

Not a database or a cache kept in sync: a second copy of the truth brings migrations and sync
bugs, and hides it from grep, git and pull requests.
```

Its price is not in the file. RISK-0003 gets `links: { price-of: DEC-0003 }` where it has a prose
mention today, and already says what retires it and by when.

```markdown
---
id: DEC-0004
---

# TypeScript on Node.js 24 and Effect 4, run from source

Not a Go or Rust binary: sdp loads a workspace's step definitions and types its `annotate()`
calls, so it runs where the workspace's code runs. Not a build step: Node.js 24 executes the
sources, so people and agents run what they edit, at the cost of erasable syntax only. Effect,
not plain `async`, for timeouts, typed errors and a file system that scenarios swap for one in
memory.
```

```markdown
---
id: DEC-0011
---

# A result is fingerprinted per kind of input, and gates never read gates

Not the files each scenario touched, which needs tracing and still misses what a step reads
through a service: any code change makes every result stale, and that is acceptable while a full
run takes seconds. Gates read ordinary results and never a gate's, because results that read
results have no order to be evaluated in.
```

These three replace 63, 112 (with DEC-0012) and 86 lines. The other seven:

| DEC | Title | The sentence | Price |
| --- | --- | --- | --- |
| 0001 | A spec is Markdown with front matter and fenced Gherkin | Not `.feature` files, where an idea without a scenario and a decision's reason have no place, and not Cucumber's Markdown dialect, where every heading and bullet is syntax. | RISK-0002, RISK-0005 |
| 0002 | Kinds and relations are the authors' words; sdp interprets a few, named in one profile | Not a metamodel, which makes every team translate its words into ours. The interpreted words sit in one profile and not where the code needs them, so renaming one changes what sdp reads instead of switching a feature off. | RISK-0001 |
| 0005 | Maturity is declared and checked; that it works is derived | Not one status field, which rots. How well a thing is understood is a judgement, so it is declared and checked against the content; that it works is never declared. | RISK-0004 |
| 0006 | Graph questions are one-line path patterns | Not jq alone, where a multi-hop question is a program, and not Cypher or SPARQL, which need an engine and several lines: a question must fit a shell argument and one Gherkin step. | none recorded |
| 0007 | Phases follow risk, and each ends in a milestone whose gate is scenarios | Not a backlog or sprints: nothing in them says the architecture is proven before features are built on it, and their status lives where no scenario can read it. | RISK-0007 |
| 0008 | The architecture is what architects declare | Not harvested from code and ranked by a metric: which few parts are significant is a judgement, and a list of every abstraction buries them. | none recorded |
| 0009 | In TypeScript an annotation is a typed call beside the declaration | Not a comment, which the compiler cannot check and a rename leaves behind, and not a decorator, which is not erasable syntax and runs. | none recorded |

"Not …, because …" is the template's prompt, not a syntax. It makes the third test visible: a
choice that cannot name what it was chosen over is not a decision.

## 2. Should a decision be a spec and a node?

### What the graph gets from decision nodes today

- **`decided-by`: 48 edges from 34 nodes** — 16 from requirements, 13 from elements, 10 from the
  vision's principles, 3 each from quality requirements and milestones, 2 from the plan, 1 from a
  pattern. Four decisions have none.
- **`sdp arch`** prints a decision's title under 11 of the 16 architectural nodes. This is the
  use I would miss most: the element and the reason it is shaped that way, on one screen.
- **`sdp context`** lists "Decisions in reach" with 280 characters of the Decision section, which
  begin "Option 3." Worse, every node planned in I1 gets all eighteen, because the decisions carry
  `iteration: I1` and reach passes through the iteration (REQ-cli, ARCH-query-engine and
  REQ-decision-records each list eighteen; REQ-npm-package two; REQ-web-explorer none). Today
  this section is noise.
- **Gates.** MS-LCO requires that Inception's decisions are accepted, which is true by
  construction. MS-LCA requires that no architectural decision is open, and that every element
  rests on a decision or a quality requirement, which five nodes fail today. The vision requires
  that every principle rests on a decision *that a scenario guards*: this gate is what put
  scenarios on decisions.
- **Checker.** `decision-status`, `decision-supersede`, `decision-content`. None reports anything
  on this repository.

Nobody would miss the guards, the option lists, the statuses or the supersede checks. People and
agents would miss three things: the title next to the element, the why in the context bundle of
what they are about to change, and a `[[DEC-…]]` reference that is an error when it dangles.

### The case against a node

A decision record is prose, and the north star says executable specs absorb prose. Eight of the
eighteen prove it: their value transferred to a requirement or an element, and the record became
a second copy. The node also invites bookkeeping: principles that need decisions, decisions that
need guards, elements that need decisions.

### The case for

The one sentence has to reach whoever is about to undo the choice, at the place where they would
undo it. Only a node does that: nine nodes rest on DEC-0003, and `sdp context` on any of them can
print the sentence whole. DEC-0004 constrains no single element, and a deliberate absence ("no
cache") has no element at all to carry a sentence. And the titles, one `sdp q decision` away,
are the list of what must not be undone casually.

### The alternative shapes

- **A short file outside the graph.** Loses all three uses. It suits a team that uses sdp only
  for requirements, not a tool whose subject is architecture.
- **A sentence or a resolved question on the spec it concerns.** Right for a choice one spec
  embodies; this is where the six demoted records go, and where most future choices should stay.
  Wrong for a choice several specs rest on, or one about what is absent.
- **No record where a scenario enforces the rule.** Right whenever nothing is left to say once
  the rule is stated. The same six.
- **All decisions as inline nodes of one file.** No body, so sections cannot grow back. But the
  sentence becomes a YAML string, against DEC-0001, and a check rule gives the same protection.
- **A title and a sentence in a file of its own.** What I recommend.

### The guard scenario

It is a scenario of the constrained node with a `decided-by` link pointing back. "New code must
not call legacy billing" (the example in REQ-decision-records) is a rule about ARCH-legacy-billing;
"we retire it instead of wrapping it, because …" is the decision. `sdp context` on the element
then shows the rule, its result and the why together. When the scenario carries the rule, the
decision keeps the alternative and the reason, or nothing, and then there is no decision.

### The status machinery

None of it survives.

- `proposed`: an open question on the spec it blocks. Maturity already derives the state, which
  a status field only declares; the vision's third principle argues for exactly this.
- `accepted`: the file is on the main branch.
- `rejected`: a rejection worth remembering is a decision ("No GraphQL, because …").
- `deprecated`, `superseded`, `supersedes`, the supersede check: the sentence is rewritten or the
  file deleted. sdp already treats superseded records as noise; context bundles leave them out.
- "Inactive records do not run their scenarios" goes with the scenarios.

A team that must keep immutable records with statuses still can: `status` and `supersedes` are
free words like any other, and the consistency rule is one scenario of its own.

### Conclusion

A decision is a spec and a node: the smallest kind, and the only one that is never executable.
sdp interprets its kind, as a driver in `sdp arch` and a section in `sdp context`, and nothing
else.

## Changes, smallest first

1. **Skill, AGENTS.md and the guide `sdp init` writes**: one bullet. "Record a decision only
   when it is hard to reverse, surprising without context and a real trade-off: a title that
   states the choice and a sentence that says what it was chosen over and why. Any other choice
   is a sentence or a resolved open question in the spec it concerns." Agents are the ones who
   over-produce decisions, so this has the most effect.
2. **Template** (`src/app/Templates.ts`):

   ```markdown
   ---
   id: DEC-0007
   # Only for a choice that is hard to reverse, surprising without context and a real trade-off.
   # What rests on it links here with `decided-by`; its rules are scenarios there; its price is a risk.
   ---

   # Use Postgres for orders

   Not <what a reasonable person would have chosen>, because <why>.
   ```

   `template-placeholder` learns this prompt in place of "We will …".

3. **Context bundle** (REQ-agent-context, `src/graph/Context.ts`): print a decision's text whole,
   with no `## Decision` lookup, and do not reach through a plan relation. The second also thins
   "Architecture within 2 hops".
4. **Checker** (REQ-check-rules): remove `decision-status`, `decision-supersede` and
   `decision-content`. Add one rule, `decision-shape`: a decision that has a section or a
   scenario, with the hint "a rule is a scenario on what it constrains; a cost is a risk". This
   is what stops the next review from adding Options back.
5. **Vocabulary and runner**: remove `statuses` and `relations.supersedes`, the runner's skip by
   status (REQ-executable-specs, "Specs whose `status` is …") and the decisions line of
   `sdp status`.
6. **REQ-decision-records**, retitled "Decision records". Its prose becomes the five points of
   the recommendation. Three scenarios: the smallest record passes `sdp check` clean; a record
   with a section or a scenario is reported; the context of a node that rests on a decision
   prints its sentence whole.
7. **Glossary**: `decision` is redefined, `guard` and the `category, date, deciders` row go, and
   a term that cites a demoted record cites the spec that owns the rule.
8. **This repository**: ten records become a title and a sentence; eight are deleted; fifteen
   scenarios move and five are deleted; the six risks that mention a decision link to it with
   `price-of`; 0012's `decided-by` links go to DEC-0004 and 0015's to DEC-0007; `iteration:`
   leaves the decisions. README and `examples/shop` follow the template.
9. **The vision's principles.** Five of the six restate one decision's title and the sixth is a
   quality goal that NFR-greppable and NFR-no-build-step already measure; their `decided-by`
   edges are ten of the forty-eight. The vision should link to those decisions and quality
   requirements and give the query, as it does for its capabilities, and the principle nodes go.
10. **Gates.**

    ```gherkin
    # VISION, replacing "Every principle rests on a decision that a scenario guards"
    Scenario: Every decision is one that something rests on
      Then the query "decision" returns at least 1 result
      And the query "decision !<-decided-by- *" returns no results

    # MS-LCO, replacing "Decisions taken in Inception are accepted"
    Scenario: Nothing written in Inception is still undecided
      Then the query "*[openQuestions>0] ?-iteration-> iteration[phase=PH-inception]" returns no results

    # MS-LCA, replacing "No architectural decision is left open"
    Scenario: No element or pattern has an open question
      Then the query "element|pattern[openQuestions>0]" returns no results
    ```

    All three queries run today.

## What I am unsure about, for the owner

1. **No status at all.** It is the largest step away from ADR habit and from the reference
   format, which keeps status as an option. I am confident for this repository, where nothing is
   `proposed` and 25 questions are open. For adopters it rests on open questions being as visible
   as a list of proposed decisions: `sdp q '*[openQuestions>0]'` is, `sdp status` is not yet.
2. **`decision-shape` as a built-in rule.** It makes sdp opinionated about the body of one kind.
   I think that is in character, and it is the only mechanical guard against records growing
   back. The alternative is the template and a convention.
3. **The vision without its six lines.** Linking instead of restating removes a copy, and a
   reader on GitHub then follows links to read what sdp holds to. PAT-derived-index and DEC-0003
   are the same case; which shrinks is the architects' call.
4. **DEC-0010 (link key).** If "link any value that looks like an id" is a convenience you
   expect agents to propose again, keep it, and the number is eleven. DEC-0011 could instead
   fold into DEC-0005, making nine.
5. **MS-LCA's "every element rests on a decision or a quality requirement".** With decisions
   scarce, it asks for five links nobody has a reason to draw, or five decisions written to
   satisfy it. DEC-0008 says an element's own description says why it matters. I would reduce
   the gate to "every element has a description".
6. **Renumbering to close gaps.** I would stop. Ids are cited in code comments
   (`src/model/Vocabulary.ts:146`) and commit messages, and a gap costs nothing.
7. **Decisions leave the plan.** Without `iteration:` a decision is no longer analysis-and-design
   work in `sdp lifecycle`; the open question on a planned spec is. I1's row thins accordingly.
