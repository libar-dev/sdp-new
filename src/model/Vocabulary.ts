/**
 * The vocabulary profile: the few words sdp itself interprets. Authors name
 * kinds, relations and attributes freely; sdp reads meaning into a small set
 * of them — a decision, a milestone, the relation that plans work into an
 * iteration, the attribute that maps disciplines to iterations — and this
 * module is the only place that names those words. Every other module asks it.
 *
 * Each role has a default word, and a workspace renames a role under
 * `vocabulary:` in its configuration (REQ-configuration). `sdp vocabulary`
 * prints the active profile. Words sdp makes itself (the `scenario` and `code`
 * kinds, derived attributes such as `stage`) are fixed and listed here too.
 */
import { annotate } from "sdp/annotations"

annotate(import.meta, { is: "ARCH-vocabulary" })

export type Words = ReadonlyArray<string>

export interface Vocabulary {
  /** Kinds sdp reads meaning into; each role lists the kinds that play it. */
  readonly kinds: {
    /** Decision records: status rules, supersession, "decisions in reach". */
    readonly decision: Words
    /** Milestones: their scenarios are gates. */
    readonly milestone: Words
    readonly phase: Words
    readonly iteration: Words
    /** Patterns: the architecture view shows each with the elements that apply it. */
    readonly pattern: Words
    /** The kinds whose nodes are the architecture: declaring one is the architect's call. */
    readonly architectural: Words
    /** Architectural drivers, shown next to the architecture they shape. */
    readonly driver: Words
    /** The kind of a node an anchor annotation declares without naming one. */
    readonly anchored: string
  }
  readonly relations: {
    /** From a newer decision to the one it replaces. */
    readonly supersedes: Words
    /** From planned work to the iteration it is planned into. */
    readonly plan: Words
    /** From an iteration or a milestone to its phase. */
    readonly phase: Words
    /** The edge sdp makes for a `[[ID]]` in prose. It is not a link: `*` does not follow it. */
    readonly mention: string
    /** The edge sdp makes from a scenario to its spec. */
    readonly scenario: string
    /** The code annotation that anchors a node in code and may declare it. */
    readonly anchor: string
  }
  readonly attributes: {
    /** Disciplines mapped to the iterations their work on the node is planned into. */
    readonly activity: string
    /** A phase's position in the lifecycle. */
    readonly order: string
    /** An iteration's first and last day (ISO dates). */
    readonly start: string
    readonly end: string
    /** The attribute whose value (one of `qualities`) marks a quality requirement of any kind. */
    readonly quality: string
  }
  /** Values of the `quality` attribute that make a node an architectural driver. */
  readonly qualities: Words
  readonly statuses: {
    /** The statuses a decision may have. */
    readonly decision: Words
    readonly accepted: string
    readonly superseded: string
    /** Statuses of records that no longer apply: their scenarios do not run. */
    readonly inactive: Words
  }
  /** The authoring maturity ladder, lowest first. */
  readonly maturity: Words
  /** Disciplines and the kinds whose planned nodes are, by default, work in each. */
  readonly disciplines: ReadonlyMap<string, Words>
  /** Front matter keys that link besides `links:`, the plan and phase relations and `activity`. */
  readonly links: Words
  /**
   * Words of the workspace's own that nothing in its graph has yet. An assertion names only words
   * sdp knows — or a typo would pass — so a rule that there is none of something declares its word here.
   */
  readonly words: { readonly kinds: Words; readonly relations: Words; readonly attributes: Words }
}

/** What an empty configuration means. */
export const defaultVocabulary: Vocabulary = {
  kinds: {
    decision: ["decision"],
    milestone: ["milestone"],
    phase: ["phase"],
    iteration: ["iteration"],
    pattern: ["pattern"],
    architectural: ["element", "pattern"],
    driver: ["decision", "nfr"],
    anchored: "element"
  },
  relations: {
    supersedes: ["supersedes"],
    plan: ["iteration"],
    phase: ["phase"],
    mention: "mentions",
    scenario: "verifies",
    anchor: "is"
  },
  attributes: {
    activity: "activity",
    order: "order",
    start: "start",
    end: "end",
    quality: "type"
  },
  qualities: ["quality", "non-functional", "nfr", "constraint"],
  statuses: {
    decision: ["proposed", "accepted", "rejected", "deprecated", "superseded"],
    accepted: "accepted",
    superseded: "superseded",
    inactive: ["superseded", "rejected", "deprecated"]
  },
  maturity: ["idea", "draft", "specified", "ready"],
  disciplines: new Map<string, Words>([
    ["business-modeling", ["capability", "goal", "actor", "business-process", "vision", "stakeholder"]],
    ["requirements", ["requirement", "nfr", "feature", "story", "use-case", "epic"]],
    ["analysis-design", ["decision", "element", "pattern"]],
    // No kind is implementation or test work by itself: a spec plans them with `activity:`.
    ["implementation", []],
    ["test", []],
    ["deployment", ["release", "environment", "deployment"]]
  ]),
  links: [],
  words: { kinds: [], relations: [], attributes: [] }
}

/** Words sdp makes itself. They are not configurable, and authors cannot write them. */
export const made = {
  kinds: {
    scenario: "scenario",
    /** An annotated declaration or file. */
    code: "code",
    /** What an unresolved reference points at. */
    missing: "missing"
  },
  /** Facts sdp computes on the nodes authors declare; writing one is a `derived-attribute` error. */
  attributes: ["stage", "verification", "scenarios", "summary", "file", "openQuestions", "declaredIn"],
  /** Facts sdp computes on scenario nodes. */
  scenarioAttributes: ["spec", "keyword", "tags", "rule", "steps", "examples", "status", "staleBecause", "lastRun", "hash"],
  /** The attributes a node has only through scenario results, on any kind; a scenario's `status` is one more. */
  resultAttributes: ["stage", "verification", "staleBecause", "lastRun"],
  /** When a scenario's result was recorded: shown to readers, never to a scenario that runs. */
  recordedAt: "lastRun",
  /** Where a node is in delivery, beyond its declared maturity (DEC-0005). */
  stages: { failing: "failing", inProgress: "in-progress", verified: "verified" },
  /** `declaredIn` of a node an anchor annotation declares. */
  declaredInCode: "code"
} as const

/**
 * Names no link may have. A link reads as an attribute of the node it starts from (DEC-0010), so
 * one named like a fact sdp derives, or like the maturity or the status it checks, would pass for
 * that fact.
 */
export const reservedRelations: ReadonlyArray<string> = [...made.attributes, "maturity", "status"]

/** The maturity levels whose criteria are built in; levels a workspace adds have none. */
export const criteria = { idea: "idea", draft: "draft", specified: "specified", ready: "ready" } as const

/** The word a role is written with — its first; a valid profile gives every role one. */
export const wordFor = (words: Words): string => words[0]!

export type KindRole = Exclude<keyof Vocabulary["kinds"], "anchored">
export type RelationRole = "supersedes" | "plan" | "phase"

/** Whether `kind` plays `role`, e.g. `hasKind(v, "decision", node.kind)`. */
export const hasKind = (vocabulary: Vocabulary, role: KindRole, kind: string): boolean => vocabulary.kinds[role].includes(kind)

/** Whether `rel` plays `role`, e.g. `hasRelation(v, "plan", edge.rel)`. */
export const hasRelation = (vocabulary: Vocabulary, role: RelationRole, rel: string): boolean => vocabulary.relations[role].includes(rel)

/** A node's own attribute, never one inherited from `Object.prototype` (`constructor` is a legal name). */
export const attribute = (node: { readonly attrs: Readonly<Record<string, unknown>> }, key: string): unknown =>
  Object.hasOwn(node.attrs, key) ? node.attrs[key] : undefined

/** A prose mention is not a link: the wildcard, the architecture view and context reach do not follow it. */
export const isMention = (vocabulary: Vocabulary, edge: { readonly rel: string }): boolean => edge.rel === vocabulary.relations.mention

/** Architectural drivers: kinds that are drivers, and any node whose quality attribute says it is one. */
export const isDriver = (vocabulary: Vocabulary, node: { readonly kind: string; readonly attrs: Readonly<Record<string, unknown>> }): boolean => {
  const quality = attribute(node, vocabulary.attributes.quality)
  return hasKind(vocabulary, "driver", node.kind) ||
    (typeof quality === "string" && vocabulary.qualities.includes(quality.toLowerCase()))
}

/** Records that no longer apply keep their text but stop guarding anything. */
export const isInactiveStatus = (vocabulary: Vocabulary, status: unknown): boolean =>
  typeof status === "string" && vocabulary.statuses.inactive.includes(status)

/** Front matter keys whose values are links: the plan and phase relations and the workspace's own link keys. */
export const linkKeys = (vocabulary: Vocabulary): Words =>
  [...new Set([...vocabulary.relations.plan, ...vocabulary.relations.phase, ...vocabulary.links])]

/** The relation of a planned discipline's edge: `activity.implementation`. */
export const activityRelation = (vocabulary: Vocabulary, discipline: string): string => `${vocabulary.attributes.activity}.${discipline}`

/** Whether an attribute is one sdp computes on nodes of `kind`. */
export const isDerived = (kind: string, key: string): boolean =>
  (made.attributes as ReadonlyArray<string>).includes(key) ||
  (kind === made.kinds.scenario && (made.scenarioAttributes as ReadonlyArray<string>).includes(key))

/** Every word the profile names, by what it is: for the unknown words of queries and the guard of DEC-0002. */
export const vocabularyWords = (vocabulary: Vocabulary) => ({
  kinds: [...new Set([...Object.values(vocabulary.kinds).flat(), ...[...vocabulary.disciplines.values()].flat(), ...vocabulary.words.kinds])],
  relations: [...new Set([...Object.values(vocabulary.relations).flat(), ...linkKeys(vocabulary), ...vocabulary.words.relations])],
  attributes: [...new Set([...Object.values(vocabulary.attributes), ...vocabulary.words.attributes])],
  /** Attribute values the profile names: the statuses and the qualities. Maturity levels compare only along the ladder. */
  values: [...new Set([...Object.values(vocabulary.statuses).flat(), ...vocabulary.qualities])],
  disciplines: [...vocabulary.disciplines.keys()]
})

/**
 * The words sdp interprets, as plain data: `vocabulary`, the profile in the shape of the
 * configuration section of that name, and `made`, the words sdp makes itself, which nothing configures.
 */
export const vocabularyJson = (vocabulary: Vocabulary) => ({
  vocabulary: { ...vocabulary, disciplines: Object.fromEntries(vocabulary.disciplines) },
  made: {
    /** The kinds of the nodes sdp makes; no author's node has one. */
    kinds: Object.values(made.kinds),
    /** The attributes sdp derives on the nodes authors declare. */
    attributes: made.attributes,
    /** The attributes of a scenario node. */
    scenarioAttributes: made.scenarioAttributes,
    /** The stages beyond the maturity ladder. */
    stages: Object.values(made.stages),
    /** The names no link can have. */
    reservedRelations
  }
})
