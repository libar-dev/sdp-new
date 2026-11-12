/**
 * Typed code annotations: link code to the specification graph with ordinary,
 * type-checked TypeScript instead of comments.
 *
 *   import { annotate } from "sdp/annotations"
 *
 *   export class Graph { ... }
 *   annotate(Graph, { is: "ARCH-graph", "instance-of": "PAT-derived-index" })
 *   annotate(import.meta, { implements: ["REQ-graph-query"] })   // the whole module
 *
 * The target is a real symbol, so renaming it or finding its references includes
 * the annotation. Once `sdp types` has written the workspace's id declarations,
 * an id that does not exist is a compile error. `annotate` returns its target
 * and does nothing at run time: sdp reads the calls statically and never runs
 * your code. This module has no imports, so depending on it costs nothing.
 *
 * Limits:
 * - Targets are run-time values: classes, functions, constants, `import.meta`
 *   for the module. Interfaces and type aliases cannot be passed; for a
 *   type-only abstraction, annotate the module that defines it or the value
 *   that realizes it.
 * - Ids are checked only as far as the generated declaration goes: the
 *   compiler must include it (tsconfig `include`) and it must be current. Until
 *   `sdp types` has run any string is accepted; `sdp check` reports
 *   `types-stale` when it lags behind the specs.
 * - sdp reads a call only where `annotate` (or a namespace import's
 *   `.annotate`) still refers to this module's export, imported from
 *   "sdp/annotations" or "sdp" with an ES `import`: a parameter or local of the
 *   same name shadows it. Ids and attributes must be literals; `as const` and
 *   `satisfies` around them are fine.
 */

/** Every id in the workspace, mapped to its kind. Empty until `sdp types` writes the declaration that fills it. */
export interface Ids {}

/** A node id: any string until `sdp types` has run, then only ids that exist. */
export type Id = [keyof Ids] extends [never] ? string : Extract<keyof Ids, string>

/** Ids of one kind, e.g. `IdOf<"decision">`. */
export type IdOf<Kind extends string> = [keyof Ids] extends [never] ? string
  : Extract<{ [K in keyof Ids]: Ids[K] extends Kind ? K : never }[keyof Ids], string>

/** Relations from the annotated code to graph nodes. Relation names are free-form, as everywhere in sdp. */
export type Links = { readonly [relation: string]: Id | ReadonlyArray<Id> }

/** Attributes of a node that an `is` link declares in code because no spec does. */
export interface Declaration {
  readonly kind?: string
  readonly title?: string
  readonly significant?: boolean
  readonly rationale?: string
}

/**
 * Links `target` — a class, function, constant or `import.meta` for the module — to graph nodes.
 * For a type-only abstraction, annotate the module or the value that realizes it.
 */
export const annotate = <const Target>(target: Target, links: Links, declaration?: Declaration): Target => target
