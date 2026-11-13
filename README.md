# Archive: organizing the specs and choosing a runner, November 2026

What was read and tried while the specs were organized into areas, a backlog and epics, the
vocabulary was pinned, and the runner was decided (branch `organize-specs`). sdp reads nothing here,
and none of it is a specification: what was concluded is in `specs/` on the default branch.

## research/

Three reports the work started from, as they were received.

- `research-organizing-specs.md`: how Gherkin suites are organized as both future behaviour and
  acceptance tests. Behind the areas, the backlog and the place of epics.
- `gherkin-forks.md`: projects that extend Gherkin or run it elsewhere. Behind keeping the official
  parser, and behind the decision `a-host-runner-runs-application-suites`.
- `effect4.md`: an audit of the Effect 4 code. One rule of ARCHITECTURE came of it.

## discussion/

The working discussion of 13 November 2026, up to the point where the runner question was opened.

## prototypes/

Run on 13 November 2026 with Node.js 24.22.2 against `libar-platform` (Vitest 5.0.3, convex 1.46.0,
convex-test 0.0.60). They hold absolute paths of the machine they ran on: point them at a checkout
of `libar-platform` and of this repository, and give each a `node_modules` (the two Vitest ones
used a link to `libar-platform/node_modules`).

- `sdp-run-cannot-load-the-adopter/`: a workspace whose step definitions import the adopter's
  kernel and its convex-test composition. `sdp run` fails both on the first import: the adopter
  writes `./x.js` for a file `x.ts`, which Node.js alone does not resolve. Its convex-test tier also
  rests on `import.meta.glob` and the edge-runtime environment, which only Vite provides.
- `scenarios-in-vitest-on-the-adopter/`: a Vite plugin that makes a `.feature` file a Vitest test
  module, a runtime that matches and runs steps, and a reporter that writes one sdp result per
  scenario. One feature ran in two Vitest projects: 3 scenarios passed against the adopter's real
  code (the kernel's `fold`, and `receipts.sweep` on convex-test), and an example of work still to
  come ran and failed nothing. `sdp-results.json` is what the reporter wrote. Known gaps, now rules
  of `run-specs-in-another-runner`: a scenario outside a project's tags is skipped where it should
  be left out, a result is kept per scenario and not per way of running, and what a scenario ran
  against is not recorded.
- `vitest-adapter-first-sketch/`: the first sketch, about 70 lines, on a toy cart.
