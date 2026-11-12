# Notes for wave 5, stage 2 (the hand pass), from probes of the installed Gherkin parser

Probe scripts: `../research-probe/probe.mjs`, `probe2.mjs` (gherkin 42.0.1).

- **Where a reason may be written.** Write a reason under `Rule:`. Under `Scenario:` or
  `Background:`, a description line that starts with `Given`, `When`, `Then`, `And`, `But` or `*`
  silently becomes a step. In any description, a line starting with `Scenario:`, `Example:`,
  `Scenario Outline:`, `Rule:` or `Background:` silently opens a new block, a line starting with
  `@` is a parse error, and a line starting with `#` is dropped.
- **Indentation is not structure.** After the first `Rule:` every scenario belongs to the rule
  above it, whatever its indentation. The converter appends `@open` rules at the end of a file, so
  after grouping, list each spec's scenarios with their rule and confirm none sits under an `@open`
  rule or the wrong one.
- **Nested doc strings in feature fixtures.** When a fixture feature inside a doc string itself
  contains a doc string, delimit one with `"""` and the other with three backticks, or escape the
  inner one as `\"\"\"`. Both work on the installed parser.
- **Tags.** No whitespace and no `@` inside a tag; whitespace followed by `#` ends a tag line.
- **Optional:** REQ-cucumber-compatibility is a draft, so it becomes rules without examples; the
  research at `/Users/darkomijic/work/gherkin-research.md` names four dimensions of compatibility
  (syntax, binding, execution, evidence) that are its natural four rules and make RISK-0006
  concrete.

## For the next session (from the same research), in priority order

1. Own runner, or an adapter (sdp as a Cucumber-JS plugin, or compiling to a host runner): decides
   hooks, parameter types and RISK-0006 together. Verify the plugin API claim first.
2. A scenario-end hook: closes the command-outcome gap and cleans up temporary directories.
3. Custom parameter types (`ParameterTypeRegistry.defineParameterType` works; needs an API in
   `sdp/steps` and static discovery of the definitions).
4. Cucumber Messages as an evidence export: sdp's step statuses are the Messages statuses minus
   `UNKNOWN`, so existing HTML reporters could render a run (the reader without a terminal;
   REQ-shared-evidence).
5. Step semantics: keyword-sensitive matching, step categories, scoped step libraries (RISK-0002).
6. A localised suite (`# language: de`) reads the same.
7. Rules as properties (`@property` scenarios, typed invariants).
8. Steps composed in Gherkin.

Not worth doing: `.feature.md` (the parser discards every description); external data or dynamic
examples through tags; generating or deleting implementation when a spec changes; context-scored
step matching; Gauge.
