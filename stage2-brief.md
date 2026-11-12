# Wave 5, stage 2: the hand pass

You are one of five writers doing the same job on disjoint sets of spec files of **sdp**. Your
worktree starts at the head of `review/redesign` (`b4ff381`). Do the work yourself; start no
subagents.

## Read first
1. `AGENTS.md` and `.claude/skills/sdp/SKILL.md` in your checkout: the working loop and, in the
   skill, the format in one file and the list of sharp edges of Gherkin.
2. In this folder: `DESIGN-BRIEF.md` — D22 (a spec is a Gherkin file; rules are enforced) with D19
   and D21, "Taste" and "How to work"; `advice-executable-specs.md` for the format, with the worked
   examples under `advice-executable-specs/examples/specs/` (`requirements/REQ-graph-query.feature`
   and `architecture/ARCH-query-engine.feature` are the model for a verified spec, the two
   `REQ-…` drafts for a spec that has rules and no examples yet); `stage2-notes.md` for what the
   official parser does that will bite you.

Setup: if `node_modules` is missing, `ln -s /Users/darkomijic/work/sdp-new/node_modules node_modules`.
`npm run verify` needs `jq` (installed).

## Where things stand
Stage 1 gave sdp a Gherkin reader (tags as annotations, rules as nodes, `@open`, descriptions) and
converted every spec of this repository to a `.feature` file with a script. The conversion was
mechanical: it changed no scenario name, step or order. What it could not do is yours:

- 269 scenarios sit outside any `Rule:` (the repository runs with `rules: optional` until this
  pass is done);
- 111 `# TODO(convert)` comments mark prose, headings and mentions that need a decision;
- about 200 doc strings in scenarios still write Markdown specs (`.md` with front matter) as
  fixtures. The Markdown reader is deleted in the next stage, so every one of them must go.

## The owner's standard for this pass
"Rules are probably one of the most important parts of specs." "I would rather enforce rules than
not have it." And the north star: after implementation the executable spec carries all the value,
with no prose around it. `sdp context <id>` leads with a spec's rules; read as a list, they must be
the contract a person or an agent needs, and nothing else.

## What to do, in each of your files
1. **Every scenario belongs to a rule it is an example of.**
   - A rule's name states what must hold, as a sentence that can be true or false: "A result
     counts only while what it ran against is unchanged", not "Staleness" or "Front matter".
   - A rule's description, when it has one, says *why* in one to three sentences: the reason the
     examples cannot show. Most rules need none. Never a "verified by" list, never a restatement of
     the examples, never a status.
   - Where a rule exists because of a decision, tag the rule `@decided-by:DEC-x` and drop the
     sentence that said so.
   - A scenario's name says the case, not the rule again. Keep a scenario's name where it still
     does that (its id is a slug of the name, and results are keyed by it); rename where it does
     not.
   - Do not force one rule per scenario, and do not sweep unrelated scenarios under a vague rule
     to get them inside one. If a scenario is an example of no rule you can state, say so in your
     report rather than inventing one.
   - Milestones use rules too: a gate scenario is an example of the rule the milestone asks to
     hold.
2. **Resolve every `# TODO(convert)`.** Prose becomes a rule's name, a rule's reason, or the
   Feature's intent paragraph, or it goes. An id mentioned in prose becomes a relation tag at the
   level it concerns (`@decided-by:`, `@uses:`, `@refines:`…) or disappears; there are no mentions
   in this format. No `# TODO` survives.
3. **Convert the Markdown fixtures.** A doc string that writes a `.md` spec becomes a feature
   fixture (`Given a file "specs/REQ-a.feature" containing:`) or rows of `Given these specs:`
   (columns `tags | Feature`), whichever reads shorter; expected `file:line` values are re-derived
   by running, not guessed. A scenario that pins Markdown itself — front matter, CommonMark
   fences, `[[wiki-links]]`, embedded `nodes:`, "Open questions" sections, `links:` shapes — is
   deleted if the same rule is already pinned for feature files, rewritten for feature files if
   the rule still applies and is not pinned, and listed in your report either way.
4. **Check the `@open` rules.** The converter appended them at the end of a file; after the first
   `Rule:` a scenario belongs to the rule above it whatever its indentation. No scenario may end up
   under an open question. `node src/cli/main.ts q 'scenario[spec=<ID>]' --json` shows each
   scenario's rule; `node src/cli/main.ts q 'scenario[spec=<ID>][!rule]' --ids` must print nothing
   for each of your specs when you are done.
5. **Keep it short.** Where two scenarios pin the same case, keep one. Where a fixture is larger
   than the case needs, cut it. This pass should leave your files smaller in lines even though
   every scenario gains a rule.

## Boundaries
- Your files are listed in your task. Do not edit another writer's spec.
- Do not change `src/` or the step definitions in `specs/steps/`. The fixture steps already take
  feature files. If something there blocks you (a missing column, a step that only reads
  Markdown, a defect in the reader), make the smallest change that unblocks you, and describe it
  in your report so the five branches can be merged deliberately — or, better, work around it and
  report it.
- Do not remove `rules: optional` from `sdp.config.yaml`, do not delete the Markdown reader, and
  do not touch `README.md`, `AGENTS.md` or the skill: the next stage does those.
- Do not add or remove architecture elements, decisions or `is` anchors, and do not record a
  milestone as met.

## Done means
`npm run verify` passes, everything is committed on your branch in small coherent commits (end
commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`), and your final message
has, per file: rules and scenarios before and after, lines before and after; the rules as a list
(they are the contract — I will read them); scenarios deleted, each with what pins its rule now
or why the rule is gone; scenarios renamed (count); how each `TODO(convert)` was resolved, in a
line; any scenario you could not place under a rule; anything you changed or need changed in
`src/` or `specs/steps/`; and the last lines of `npm run verify`.
