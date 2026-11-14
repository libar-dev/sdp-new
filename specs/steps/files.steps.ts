/** The files of a scenario: fixtures, generated specs and copies of this repository. */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { cp, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { defineSteps } from "sdp/steps"
import { newSpec } from "../../src/app/Templates.ts"
import { load, newWorld, setFile } from "./world.ts"
import { directoryOf, repository } from "./process.ts"

export default defineSteps(newWorld, ({ Given }) => {
  Given("a file {string} containing:", ({ args: [path], doc, world }) => setFile(world, path, doc ?? ""))

  // A directory of this repository is the workspace; a file of it is a file of the workspace at the same path.
  Given("the workspace is a copy of {string}", async ({ args: [source], world }) => {
    const directory = await directoryOf(world)
    const from = join(repository, source)
    // Its step definitions import "sdp/steps" with nothing installed: sdp resolves that import itself.
    await cp(from, (await stat(from)).isDirectory() ? directory : join(directory, source), {
      recursive: true,
      filter: (file) => ![".sdp", "node_modules"].includes(basename(file))
    })
  })

  // Each row joins the workspace before the next is created, as with `sdp new`.
  Given("specs created from the sdp new templates:", ({ table, world }) =>
    Effect.gen(function*() {
      const [header = [], ...rows] = table ?? []
      for (const row of rows) {
        const cell = (name: string) => row[header.indexOf(name)] ?? ""
        const project = yield* load(world)
        const created = newSpec({
          kind: cell("kind"),
          title: cell("title"),
          maturity: cell("maturity") || undefined,
          today: "2026-11-12",
          config: project.config,
          graph: project.graph
        })
        if (Result.isFailure(created)) assert.fail(created.failure)
        const { file } = created.success
        assert.ok(file, `sdp new ${cell("kind")} writes no file`)
        setFile(world, file.path, file.content)
      }
    }))

  // One spec per row, its tag line and the name of its Feature: the whole file, specs/<id>.feature.
  Given("these specs:", ({ table, world }) => {
    const [header = [], ...rows] = table ?? []
    const cell = (row: ReadonlyArray<string>, name: string) => row[header.indexOf(name)] ?? ""
    for (const row of rows) {
      const tags = cell(row, "tags")
      const id = /@id=(\S+)/.exec(tags)?.[1]
      assert.ok(id, `a spec needs an @id= tag: ${tags}`)
      setFile(world, `specs/${id}.feature`, `${tags}\nFeature: ${cell(row, "Feature")}\n`)
    }
  })

  Given("a chain of {int} nodes linked by {string}", ({ args: [count, rel], world }) => {
    for (let i = 1; i <= count; i++) {
      setFile(world, `specs/N${i}.feature`, `@id=N${i} @kind=node${i}${i < count ? ` @${rel}:N${i + 1}` : ""}\nFeature: N${i}\n`)
    }
  })

  Given("a generated workspace of {int} specs", ({ args: [count], world }) => {
    for (let i = 0; i < count; i++) {
      setFile(
        world,
        `specs/feature-${i}.feature`,
        `@id=feature-${i} @maturity=specified @depends-on:feature-${(i * 7) % count} @refines:feature-${(i * 3) % count}\nFeature: Feature ${i}\n\n` +
          `  Feature ${i} works.\n\n  Rule: It works\n\n    Scenario: Works\n      Given a thing ${i}\n      When it is used\n      Then it works\n`
      )
    }
  })
})
