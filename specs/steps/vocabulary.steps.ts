/**
 * The types sdp prints for a workspace's links and facts: the kinds at each end of a link, and the
 * value and the kinds a fact is written on.
 */
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { assertRows, newWorld, show, stdout, type World } from "./world.ts"

/** The `types` section of what `sdp vocabulary --json` printed last. */
const printedTypes = (world: World): { readonly links: Record<string, { from: Array<string>; to: Array<string> }>; readonly facts: Record<string, { value: string; on: Array<string> }> } => {
  const types = JSON.parse(stdout(world))?.data?.types
  assert.ok(types, "run `sdp vocabulary --json` first: no types were printed")
  // The ends and placements are lists of kinds, not a sentence that reads like one.
  const lists = [
    ...Object.values(types.links ?? {}).flatMap((type: any) => [type.from, type.to]),
    ...Object.values(types.facts ?? {}).map((type: any) => type.on)
  ]
  assert.ok(lists.every((list) => Array.isArray(list) && list.every((kind: unknown) => typeof kind === "string")), "each end and placement is a list of kinds")
  return types
}

export default defineSteps(newWorld, ({ Then }) => {
  // The type table as sdp prints it: every typed relation, each end a comma-separated list.
  Then("the link types are:", ({ table, world }) =>
    assertRows(
      "link types",
      Object.entries(printedTypes(world).links).map(([relation, type]) => ({ relation, from: show(type.from), to: show(type.to) })),
      table,
      "exactly"
    ))

  Then("the fact types are:", ({ table, world }) =>
    assertRows(
      "fact types",
      Object.entries(printedTypes(world).facts).map(([fact, type]) => ({ fact, value: type.value, on: show(type.on) })),
      table,
      "exactly"
    ))
})
