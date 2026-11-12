/**
 * Step definitions bind Gherkin step text to code. Expressions are standard
 * Cucumber Expressions; their parameters are typed from the expression string
 * (`{int}` → number, `{string}` → string), and handlers may return nothing, a
 * Promise, or an Effect.
 *
 *   export default defineSteps(() => ({ cart: [] as Array<string> }), ({ Given, Then }) => {
 *     Given("a cart with {int} items", ({ world, args: [n] }) => { ... })
 *     Then("the total is {float}", ({ world, args: [total] }) => Effect.gen(function*() { ... }))
 *   })
 *
 * Each scenario gets a fresh world per world factory. Modules that pass the same factory
 * function share one world, so a step library can be split across files:
 *
 *   // world.ts
 *   export const newWorld = () => ({ cart: [] as Array<string> })
 *   // cart.steps.ts and checkout.steps.ts
 *   export default defineSteps(newWorld, ({ Given }) => { ... })
 */
import { annotate } from "../annotations.ts"
import { Data, Effect } from "effect"
import { fileURLToPath } from "node:url"
import type { Project } from "../graph/Build.ts"

type ParamType<P extends string> = P extends "int" | "float" | "double" | "byte" | "short" | "long" ? number
  : P extends "biginteger" ? bigint
  : string

/** `"a {int} b {string}"` → `[number, string]` */
export type ExpressionArgs<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? [ParamType<P>, ...ExpressionArgs<Rest>]
  : []

export interface ScenarioInfo {
  readonly id: string
  readonly name: string
  readonly specId: string
  readonly tags: ReadonlyArray<string>
}

export interface StepContext<W, A extends ReadonlyArray<unknown>> {
  readonly world: W
  readonly args: A
  /** The step's doc string argument (`"""` block), if any. */
  readonly doc: string | undefined
  /** The step's data table argument, as rows of cells, if any. */
  readonly table: ReadonlyArray<ReadonlyArray<string>> | undefined
  /** The project the scenarios belong to — what built-in graph steps assert against. */
  readonly project: Project
  readonly scenario: ScenarioInfo
}

export type StepOutcome = void | PromiseLike<unknown> | Effect.Effect<unknown, unknown, never>

export interface StepDefinition {
  readonly keyword: "Given" | "When" | "Then" | "Step"
  readonly expression: string | RegExp
  readonly handler: (context: StepContext<any, any>) => StepOutcome
  /** `file:line` where the definition was registered. */
  readonly location: string
}

export interface StepModule<W = unknown> {
  readonly _tag: "StepModule"
  readonly name: string
  readonly world: () => W
  readonly definitions: ReadonlyArray<StepDefinition>
}

type Register<W> = {
  <const E extends string>(expression: E, handler: (context: StepContext<W, ExpressionArgs<E>>) => StepOutcome): void
  (expression: RegExp, handler: (context: StepContext<W, ReadonlyArray<string>>) => StepOutcome): void
}

export interface StepRegistrar<W> {
  readonly Given: Register<W>
  readonly When: Register<W>
  readonly Then: Register<W>
  /** Keyword-agnostic alias; Gherkin matches steps by text, not keyword. */
  readonly Step: Register<W>
}

/** Declares a step module: a world factory (shared by modules that pass the same one) and its step definitions. */
export const defineSteps = <W>(
  world: () => W,
  register: (registrar: StepRegistrar<W>) => void,
  options: { readonly name?: string } = {}
): StepModule<W> => {
  const definitions: Array<StepDefinition> = []
  const make = (keyword: StepDefinition["keyword"]): Register<W> =>
    ((expression: string | RegExp, handler: (context: StepContext<W, any>) => StepOutcome) => {
      definitions.push({ keyword, expression, handler, location: callerLocation() })
    }) as Register<W>
  register({ Given: make("Given"), When: make("When"), Then: make("Then"), Step: make("Step") })
  const location = definitions[0]?.location.replace(/:\d+$/, "")
  return { _tag: "StepModule", name: options.name ?? location ?? "steps", world, definitions }
}
annotate(defineSteps, { is: "ARCH-runner" })

export const isStepModule = (value: unknown): value is StepModule =>
  typeof value === "object" && value !== null && (value as { _tag?: unknown })._tag === "StepModule"

/** Signals that a step is recognised but not implemented yet. Return it or `throw` it. */
export class Pending extends Data.TaggedError("StepPending")<{ readonly reason?: string | undefined }> {}

export const pending = (reason?: string): Effect.Effect<never, Pending> => Effect.fail(new Pending({ reason }))

const callerLocation = (): string => {
  const stack = new Error().stack?.split("\n").slice(1) ?? []
  const self = import.meta.url
  for (const frame of stack) {
    const m = /\(?((?:file:\/\/)?\/[^\s()]+?):(\d+):\d+\)?\s*$/.exec(frame.trim())
    if (!m) continue
    const file = m[1]!
    if (file === self || file === fileURLToPath(self)) continue
    return `${file.startsWith("file://") ? fileURLToPath(file) : file}:${m[2]}`
  }
  return "unknown"
}
