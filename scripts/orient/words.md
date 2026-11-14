# The words of this workspace

What each kind, relation, fact and Cucumber tag of this repository means, and what sdp does with it:
`makes` it, and nobody writes it; `interprets` it, giving it the meaning `sdp vocabulary` gives it; or
`carries` it as written, reading no meaning into it. `node scripts/orient/orient.ts` prints them first.
They move into sdp's metamodel once a workspace declares its words there.

| kind         | sdp        | meaning                                                                                                                     |
|--------------|------------|-----------------------------------------------------------------------------------------------------------------------------|
| feature      | interprets | What a user can do with sdp: its requirements as rules and their examples as its tests, one file under specs/features.      |
| rule         | makes      | A `Rule:` of a spec: one requirement, its reason under it, and the scenarios that are its examples.                         |
| scenario     | makes      | An example of a rule: a test that runs, its last result its status.                                                         |
| code         | makes      | A declaration or a file in src that an `@sdp` annotation names.                                                             |
| element      | interprets | A part of sdp's architecture, declared with `@sdp is ARCH-…` in the code that is it, whose doc comment says what it is for. |
| pattern      | interprets | A design several pieces of code apply, declared with `@sdp is PAT-…` in the code they share.                                |
| decision     | interprets | A static record of a choice that is hard to reverse, not obvious without its reason and a real trade-off.                   |
| vision       | interprets | Why sdp exists, for whom, and how it differs from the tools beside it.                                                      |
| epic         | carries    | Work still to come grouped toward one outcome, each feature or rule linked with `@includes:`; deleted once it is all live.  |
| iteration    | interprets | The days from `@start=` to `@end=`, into which work still to come is planned.                                               |
| milestone    | interprets | A gate: scenarios that must pass when the iteration it closes ends, `@met=` written once they did.                          |

| relation    | sdp        | meaning                                                                                                                                     |
|-------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| rule-of     | makes      | From a rule to its spec.                                                                                                                    |
| verifies    | makes      | From a scenario to its rule and to its spec.                                                                                                |
| imports     | makes      | From an element to each element whose code its code imports.                                                                                |
| is          | interprets | From code to the node it declares, written `@sdp is` in its doc comment: an element or a pattern, unless it names another kind.             |
| applies     | carries    | From code to a pattern it is an instance of, written `@sdp applies PAT-…` in its doc comment, and so from the element that code is part of. |
| realized-by | carries    | From a feature to the element whose code makes it work.                                                                                     |
| depends-on  | carries    | From a feature to another feature it cannot work without, so a change to that one is a change to it too.                                    |
| decided-by  | carries    | From a rule, or a whole spec, to the decision it rests on.                                                                                  |
| includes    | carries    | From an epic to each feature or rule it groups.                                                                                             |
| replaces    | interprets | From a rule, a feature or an example to the live one it replaces, which check then lets go once the replacement is live.                    |
| iteration   | interprets | From work still to come to the iteration it is planned into.                                                                                |
| closes      | interprets | From a milestone to the iteration or phase whose last day dates it.                                                                         |

| fact     | sdp        | meaning                                                                                               |
|----------|------------|-------------------------------------------------------------------------------------------------------|
| id       | interprets | The name of a spec, unique in the repository, that every link to it uses.                             |
| kind     | interprets | What a spec is, written when its id has no prefix that says it.                                       |
| maturity | interprets | How far work still to come has come, one of idea, draft, specified and ready; what is built has none. |
| start    | interprets | The first day of an iteration.                                                                        |
| end      | interprets | The last day of an iteration.                                                                         |

| fact | sdp | meaning |
|------|-----|---------|

| tag      | sdp        | meaning                                                                                                                                                               |
|----------|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| @gate    | interprets | On a scenario that asserts on delivery state: a run reports it apart and never fails on it, `sdp gate` does.                                                          |
| @open    | interprets | On a rule whose name is a question that waits on the owner's answer.                                                                                                  |
| @serial  | interprets | On a scenario that runs alone, as one that measures time must.                                                                                                        |
| @quality | interprets | On a rule, or a whole spec, that is a quality requirement: `sdp arch` shows it beside the elements that realize its feature, and `--tags @quality` runs its examples. |
