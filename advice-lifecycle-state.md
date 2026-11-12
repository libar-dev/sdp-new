# Advice: delivery state in sdp — milestones, releases, time

Read at `87f4716`. No tracked file was changed. Probes ran against today's `sdp` after a full
`sdp run` (335 scenarios pass; 18 gate scenarios, 9 pass). `closes`, `met` and `--record` below do
not exist yet, so the worked example was not run; every query in it that uses only today's words
was.

## Recommendation

Make the **milestone** the one delivery concept sdp has to understand, and give it the one fact
sdp cannot derive: **`met: <date>`**, written into the milestone's front matter by
`sdp gate <id> --record` when its gate passes. Where the project is then follows from the files:
the first milestone without `met`. The calendar (`start`/`end` on iterations) only marks today
and lateness in `sdp lifecycle`. It enforces nothing, so `sdp gate --due` goes. A met milestone
is closed and its gate stops running.

**A release is not a concept.** It is a milestone to which the team gives a `version`. Its gate
answers "is it ready", the work planned into what it closes answers "what is in it", `met` says
when, and the git tag says from which commit. sdp does not read git.

**Nothing about delivery is prose.** The plan is front matter plus the rules of planning as
scenarios. A milestone is a title and its gate. A risk's retirement is a query over its
mitigations. Status reports, iteration reviews and release notes are output, never files.

## What the probes showed

1. **The calendar turns the build red on Monday.** On 2026-11-16 E1 starts, the current phase
   becomes Elaboration, MS-LCA falls due and `sdp gate --due` exits 1. `npm run verify` then
   fails on the commit that is green today, and stays red until LCA is met, because the milestone
   that closes a phase falls due the day the phase opens. This is the option DEC-0014 rejected
   ("the same commit passes today and fails tomorrow"), moved from `sdp run` to `npm run verify`.
   Computed with `lifecycle(project, "2026-11-16")`.
2. **"Met" exists on one machine.** In a fresh checkout `sdp lifecycle` shows MS-LCO as `unrun`
   and `sdp gate MS-LCO` exits 1 until a 47-second full run. The results file is gitignored, so
   no colleague and no later commit can know that LCO was met.
3. **A past milestone is a permanent invariant.** `--due` enforces every past gate for ever. A
   new, not yet automated scenario on a requirement built in I1, or an I1 decision superseded as
   DEC-0016 prescribes from Elaboration on, makes MS-LCO fail again. This is read from the gate's
   queries, not run.
4. **RUP's shape is required.** A plan with iterations and a milestone but no phases prints "No
   phases defined yet", and its milestone is never due: `sdp gate --due` exits 0.
5. **MS-PR already is the 1.0 release.** Its gate checks `sdp --version`. `REL-0.9` and `REL-1.0`
   have one edge each (`iteration`) and no gate.
6. **Risk retirement is already derivable.**
   `sdp q 'risk ?-due-> #MS-LCA -mitigated-by-> *[stage!=verified]' --paths` prints the two
   mitigations still unverified. `status: retired` would be a hand-kept copy of that answer.
7. **Future milestones count as failures.** `sdp q '*[stage=failing]'` returns MS-LCA, MS-IOC and
   MS-PR, so `sdp status` reports `failing 3` when nothing is broken.

## The model

| Concept | State | Written where | Links | Computed from it |
| --- | --- | --- | --- | --- |
| Iteration | authored | inline node of the plan: `start`, `end`, `phase` | → phase | order of the timeline; today's iteration; planned dates of milestones |
| Phase | authored, optional | inline node of the plan: id and title, no `order` | ← iteration, ← milestone | a name for a group of iterations, ordered by its first iteration |
| Plan | authored | one spec: the timeline nodes and the rules of planning as scenarios | — | nothing; it is where the timeline is written |
| Planned work | authored, as today | `iteration:` and `activity:` on the work | → iteration | the discipline chart; the work of each milestone |
| Milestone | authored | one spec: title, `closes:`, scenarios | `closes` → a phase or an iteration; ← `due` from risks | planned date (the `end` of what it closes); its iterations and work (those since the previous milestone); gate progress n/m |
| Met | **recorded** | `met: <date>` on the milestone, written by `sdp gate <id> --record` | — | where the project is; days late or early; the gate stops running |
| Gate of a milestone | authored scenarios | the milestone | — | reported by `sdp run` and decided by `sdp gate <id>` while open; never run after `met` |
| Standing gate | authored `@gate` scenario | any other spec | — | holds whenever asked: a team names it in its build, `sdp gate POL-…`, as today |
| Release | not a concept | a milestone with `version:`, the team's attribute | as a milestone | ready: its gate. Content: its work. Date: `met`. Commit: the git tag |
| Risk | authored | spec: `affects`, `mitigated-by`, `due`; `status: tolerated` or none | → work, → milestone | retired when every mitigation is `verified`: a query, never written |
| Where the project is | derived | — | — | the first milestone without `met`, and its phase |
| Today, late | derived from the clock | — | — | shown by `sdp lifecycle` only; never in the graph, never enforced |
| Scenario results | recorded by a run | `.sdp/results.json`: local, deletable, nothing new in it | — | `stage`, gate progress |
| When, who, which commit, what changed | git | — | — | `git log -S'met:'`, tags, `sdp graph` at two commits |
| Status report, iteration review, release notes, risk list | derived output | not written | — | `sdp lifecycle`, `sdp gate <id>`, a query |

Removed: inline `release` nodes, `order` on phases, `phase:` on a milestone, risk
`status: open|retired`, `sdp gate --due` and the word "due" for gates, `stage` on a milestone,
and the prose of the plan and of each milestone.

## Time

- **There are two clocks, and only one may decide anything.** The project's position is the
  first milestone without `met`: the same on every machine and on every date, and a query can
  read it (`milestone[met]`, `milestone[!met]`). The calendar says which iteration today falls in
  and how late an open milestone is. The difference between the two is the schedule variance a
  delivery lead tracks, and it is derived.
- **Met is recorded once.** A status describes the present and rots, so sdp derives it. An event
  describes a past moment and cannot rot, so sdp records it. `date:` on a decision is the
  precedent. The file holds the date. The commit is the one that added the line
  (`git log -S'met:' -1 -- <file>`), and it is not stored, because a commit cannot contain its
  own hash.
- **Evidence still decides.** `--record` refuses unless every gate scenario passes against
  current results, and unless every earlier milestone is met. `sdp check` reports a met milestone
  that follows an unmet one. Nothing checks a hand-written `met` afterwards (see the open
  questions).
- **A later change that would fail a met gate changes nothing about the milestone.** A behaviour
  regression fails `sdp run` as it always did. A criterion that must keep holding, such as LCA's
  curated baseline, moves in the closing commit to the spec that owns the rule. A milestone met
  by mistake is reopened by deleting the line, which is a reviewed diff.
- **A slip is an edit.** When a phase runs over, the iteration dates change or an iteration is
  added, and git shows the slip. No baseline is kept in the graph.

## Releases

A release milestone, in full. `MS-beta` replaces the inline `REL-0.9`; MS-PR gets
`version: "1.0.0"` and loses its "every release is planned" lines.

````markdown
---
id: MS-beta
title: 0.9 beta
closes: T1
version: "0.9.0"
---

# 0.9 beta

~~~gherkin
Scenario: Nothing that is built is failing or half automated
  Then the query "requirement|nfr[stage=failing|in-progress]" returns no results

Scenario: What the beta tests is verified
  Then the query "requirement|nfr ?-activity.test-> #T1" returns at least 1 result
  And the query "requirement|nfr[stage!=verified] ?-activity.test-> #T1" returns no results

Scenario: 0.9 is what runs
  When I run "sdp --version" in the repository
  Then the output contains "v0.9."
~~~
````

- **Scope is not authored.** A milestone's work is what is planned into the iterations since the
  previous milestone. No `release:` key on every requirement, no list on the release. Moving work
  out of a release is the edit to its `iteration:` or `activity:` that is made anyway.
- **Relation to milestones and iterations:** a release is a milestone, and it closes a phase
  (1.0 closes Transition) or one iteration (0.9 closes T1).

```sh
sdp gate MS-PR                                   # is 1.0 ready? exit code, and what is missing
sdp q 'milestone[version]'                       # the releases, with `met` on those that shipped
sdp lifecycle --json | jq -r '.data.milestones[] | select(.id=="MS-PR").work[]'    # what 1.0 adds to 0.9
sdp q 'requirement|nfr ?-iteration|activity.implementation-> iteration' --ids      # all of 1.0: the plan
git worktree add /tmp/v0.9 v0.9.0                # what changed since 0.9, literally:
diff <(sdp -C /tmp/v0.9 q 'requirement|nfr' --ids) <(sdp q 'requirement|nfr' --ids)
```

**sdp should not read git.** Git may say when a fact in the files became true, never what is
true. The tag and the version bump belong to `npm version` and the release job. The last two
lines above need nothing built, and `sdp graph` is byte-stable between runs, so two exports diff
as cleanly as two id lists.

## What is not written

| Traditionally a document | In sdp |
| --- | --- |
| Project plan, roadmap | the plan's front matter; `sdp lifecycle` |
| Iteration plan | `iteration:` and `activity:` keys; `sdp q '* ?-iteration-> #E1'` |
| Phase objectives, release checklist | the milestone's scenarios |
| Status report | `sdp lifecycle`: position, lateness, and the open milestone's criteria one by one |
| Iteration review | the evidence rows of `sdp lifecycle`; its outcome is the re-plan, an edit |
| Release notes | titles and summaries of the release milestone's work, from a query |
| Risk list, risk burn-down | `sdp q risk`; `sdp q 'risk ?-due-> #MS-LCA -mitigated-by-> *[stage!=verified]' --paths` |
| Why a phase holds what it holds | `due` links from risks to its milestone; DEC-0007 |

History belongs to git. A fact belongs in the graph only when today's answer depends on it:
`met` does (position, which gates run, DEC-0016's "until MS-LCO is met"), and "E1 ended with
three of five done" does not.

## Free vocabulary versus RUP

The minimum sdp interprets is a milestone: a node whose scenarios are its gate and whose `met`
records that they passed. Each further layer is optional and renamed in `vocabulary:`.

| Layer | Adds | RUP | Scrum | Shape Up | Kanban |
| --- | --- | --- | --- | --- | --- |
| milestone, `met` | gates, position | LCO, LCA, IOC, PR | sprint review, release | ship | release |
| iteration, `closes` | calendar, order, scope | iteration | sprint | cycle | none |
| phase | a name for a group | phase | release train, or none | none | none |
| disciplines | chart rows | the six | none | shaping, building | none |

A Kanban team has milestones only: work links to its release with a key of the team's own, and
the release's gate queries that link. What bakes RUP in today is probe 4 and `order`; `closes`
with a phase or an iteration as its target removes both.

## Worked example

`docs/delivery/plan.md`, in full. The four prose paragraphs go: the commands are in
`sdp lifecycle --help` and AGENTS.md, and the "why" of each phase is its milestone's gate and
DEC-0007. The second scenario moves here from DEC-0007. The `@gate` scenario goes: it is a
criterion of Inception, a slightly wider form of MS-LCO's "What the prototype built is verified",
and it ends with that milestone.

````markdown
---
id: PLAN
kind: plan
title: Delivery plan for sdp 1.0
links:
  decided-by: [DEC-0007, DEC-0013]
nodes:
  - { id: PH-inception,    title: Inception }
  - { id: PH-elaboration,  title: Elaboration }
  - { id: PH-construction, title: Construction }
  - { id: PH-transition,   title: Transition }
  - { id: I1, kind: iteration, title: "Vision, scope and prototype", phase: PH-inception, start: "2026-11-02", end: "2026-11-13", planned: after-the-fact }
  - { id: E1, kind: iteration, title: Scale and compatibility, phase: PH-elaboration,  start: "2026-11-16", end: "2026-11-27" }
  - { id: E2, kind: iteration, title: Packaging,               phase: PH-elaboration,  start: "2026-11-30", end: "2026-12-11" }
  - { id: C1, kind: iteration, title: Editor support,          phase: PH-construction, start: "2027-01-04", end: "2027-01-15" }
  - { id: C2, kind: iteration, title: Spec-aware review,       phase: PH-construction, start: "2027-01-18", end: "2027-01-29" }
  - { id: C3, kind: iteration, title: Graph explorer,          phase: PH-construction, start: "2027-02-01", end: "2027-02-12" }
  - { id: C4, kind: iteration, title: Lifecycle from history,  phase: PH-construction, start: "2027-02-15", end: "2027-02-26" }
  - { id: T1, kind: iteration, title: Beta,                    phase: PH-transition,   start: "2027-03-01", end: "2027-03-12" }
  - { id: T2, kind: iteration, title: Release,                 phase: PH-transition,   start: "2027-03-15", end: "2027-03-26" }
---

# Delivery plan for sdp 1.0

~~~gherkin
Scenario: Whatever has left the idea stage is planned
  Then the query "requirement|nfr[maturity>=draft] !-iteration-> iteration" returns no results

Scenario: Every phase has iterations and a milestone that closes it
  Then the query "phase !<-phase- iteration" returns no results
  And the query "phase !<-closes- milestone" returns no results
~~~
````

`docs/delivery/milestones/MS-LCO.md`, in full, as it would stand if recorded tomorrow. The
summary paragraph goes, because the scenario names say it. The third scenario no longer reads a
risk status.

````markdown
---
id: MS-LCO
title: Lifecycle Objectives
closes: PH-inception
met: 2026-11-13
---

# Lifecycle Objectives

~~~gherkin
Scenario: The vision is broken down into capabilities and requirements
  Then the query "vision" returns 1 result
  And the query "capability" returns at least 1 result
  And the query "capability !-refines-> vision" returns no results
  And the query "capability !<-refines- requirement|nfr" returns no results
  And the query "requirement|nfr !-refines-> capability" returns no results

Scenario: What the prototype built is verified
  Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-inception]" returns at least 1 result
  And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-inception]" returns no results

Scenario: The work that retires each risk is planned
  Then the query "risk ?-due-> milestone" returns at least 1 result
  And the query "risk ?-due-> milestone -mitigated-by-> * !-iteration-> iteration" returns no results

Scenario: Decisions taken in Inception are accepted
  Then the query "decision ?-iteration-> iteration[phase=PH-inception]" returns at least 1 result
  And the query "decision[status!=accepted] ?-iteration-> iteration[phase=PH-inception]" returns no results
~~~
````

`sdp lifecycle` on 2026-11-19. The gate counts are today's; MS-beta's are what its three
scenarios give against today's graph.

```
Delivery plan for sdp 1.0          2026-11-19 · project in Elaboration · calendar in E1

  ✔ MS-LCO   Lifecycle Objectives             Inception     I1            2026-11-13  met 2026-11-13
  ▶ MS-LCA   Lifecycle Architecture           Elaboration   E1* E2        2026-12-11  1/5
        ✘ Requirements written in Elaboration are ready
        ✘ What Elaboration builds is verified
        ✘ The risks due at this milestone are retired, by verified work
        ✘ The architecture baseline is curated
        ✔ No architectural decision is left open
    MS-IOC   Initial Operational Capability   Construction  C1 C2 C3 C4   2027-02-26  1/4
    MS-beta  0.9 beta                         Transition    T1            2027-03-12  1/3
    MS-PR    Product Release                  Transition    T2            2027-03-26  1/3

  ✔ met · ▶ next to be met · * today · the date is the end of what the milestone closes
  an open milestone past its date prints "late 6d"; one met after it, "met 2026-12-15 (+4d)"

PLANNED WORK, DISCIPLINE ACTIVITY, EVIDENCE      as today, without the two release rows
```

Each row is a stretch of the timeline and the milestone that ends it, so phases, iterations,
gates, position and calendar are one table. `--json` carries the same rows as
`data.milestones[]`: `id`, `closes`, `phase`, `iterations`, `work`, `planned`, `met` and
`gate: { passed, total, unmet }`.

## Changes, smallest first

1. **Data only, this repository.** Delete `REL-0.9` and `REL-1.0`; `version` on MS-PR. Delete the
   prose of the plan and of the four milestones, and the plan's `@gate` scenario. Drop
   `status: open` from the risks, the lines that read a risk status from three gates, and
   DEC-0015's `@gate` scenario. No code.
2. **Stop the calendar enforcing, before Monday.** Delete `--due`, `dueMilestones`, `dated` and
   the "not due" and "overdue" marks; `npm run verify` loses `gate --due`. About 40 lines less in
   `src/lifecycle/Lifecycle.ts`, `src/app/Running.ts` and `src/cli/main.ts`. Rewrite the `gate`
   section of REQ-cli, DEC-0014, the last scenario of AGENTS.md and one line of the skill.
3. **`met`.** `attributes.met` in `src/model/Vocabulary.ts`; `sdp gate <id> --record` inserts the
   line; a met milestone's scenarios are not selected, next to `isActive` in
   `src/run/Evidence.ts`; `currentPhase` is the phase of the first milestone without `met`;
   `sdp check` reports a met milestone after an unmet one. About 60 lines. VISION's third
   principle and the glossary's "milestone" say "recorded as met when its gate passes".
4. **`closes`.** A relation role that replaces `phase:` on a milestone and accepts a phase or an
   iteration; milestones ordered by the `end` of what they close; phases optional and without
   `order`; `MS-beta`. About 40 lines in `Lifecycle.ts`, both templates in `src/app/Templates.ts`
   and the fixtures of REQ-lifecycle-view and REQ-cli.
5. **Output.** The milestone table on top of `sdp lifecycle`, `milestones[]` in `--json`, no
   `stage` on a milestone and a `milestones  met 1 · open 4` line in `sdp status`.

## What I would not build now

- **Reading git**: the commit of `met`, tags, activity from history, an `sdp diff`. Two exports
  and `diff` answer it today. REQ-history-lifecycle stays where it is planned.
- **`sdp release`, a changelog generator, version bumping.** npm and git do these.
- **Derived scope edges, or cumulative scope in SDPQ.** `lifecycle --json` and jq are enough
  until a gate needs them.
- **Shared evidence for the lifecycle's sake.** `met` in the file gives a fresh clone the
  project's position without a run.
- **`sdp gate` without an id for all standing gates.** This repository has none left after
  change 1; a team names its policy in its build.
- **Event logs, iteration-review or status nodes, a "reopened" state.** They are history.
- **Estimates, capacity, velocity, owners, process presets, nested time boxes.** No scenario
  needs them.

## Open: the owner's call

1. **Who writes `met`.** I recommend `--record` on request. Writing it automatically the first
   time the gate passes is the purest "evidence decides", but a phase would then end without
   anyone deciding it.
2. **Whether the closing commit is verified mechanically.** A hand-written `met` is caught only
   in review. Checking it needs the diff, so either sdp reads git for this one thing or a CI
   recipe does. I would leave it to review for now.
3. **`closes:` or no new word.** The alternative keeps `phase:` on a milestone and also accepts
   `iteration:` there. It costs nothing in vocabulary and keeps one key with two meanings.
4. **Risk status.** I recommend only `tolerated` as a declared judgement. If "its mitigations
   are verified" is not enough to call a risk gone, keep the judgement as a dated event,
   `retired: <date>`, on the same pattern as `met`.
5. **Criteria that must outlive a milestone.** I recommend moving them by hand in the closing
   commit. The alternative is a tag that keeps a milestone scenario enforced after `met`, which
   is one more mechanism.
