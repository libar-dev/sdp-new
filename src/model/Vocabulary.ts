/**
 * The vocabulary profile: the few words sdp itself interprets. Authors name
 * kinds, relations and attributes freely; sdp reads meaning into a small set
 * of them — a decision, a milestone, the relation that plans work into an
 * iteration, the attribute that maps disciplines to iterations — and this
 * module is the only place that names those words. Every other module asks it.
 *
 * Each role has a default word, and a workspace renames a role under
 * `vocabulary:` in its configuration (configure-a-workspace). `sdp vocabulary`
 * prints the active profile. Words sdp makes itself (the `scenario` and `code`
 * kinds, derived attributes such as `stage`, the `imports` between elements)
 * are fixed and listed here too.
 *
 * @sdp is ARCH-vocabulary
 */

export type Words = ReadonlyArray<string>

export interface Vocabulary {
  /** Kinds sdp reads meaning into; each role lists the kinds that play it. */
  readonly kinds: {
    /** Features: what a user can do, one spec each. An id with no prefix sdp knows names one, and a change changes one. */
    readonly feature: Words
    /** Decisions: a title and a sentence, shown with what rests on them. */
    readonly decision: Words
    /** Milestones: their scenarios are gates, and `met` records that the gate passed. */
    readonly milestone: Words
    readonly phase: Words
    readonly iteration: Words
    /** Patterns: the architecture view shows each with the elements that apply it. */
    readonly pattern: Words
    /** The kinds whose nodes are the architecture: declaring one is the architect's call. */
    readonly architectural: Words
    /** Architectural drivers, shown next to the architecture they shape. */
    readonly driver: Words
    /** The kind of a node an anchor declares when it writes none and its id has no prefix that names one. */
    readonly anchored: string
  }
  readonly relations: {
    /** From planned work to the iteration it is planned into. */
    readonly plan: Words
    /** From an iteration to its phase. */
    readonly phase: Words
    /** From a milestone to the phase or the iteration it ends. */
    readonly closes: Words
    /** The edge sdp makes from a scenario to its spec. */
    readonly scenario: string
    /** The relation of the code tag that anchors a node in code and declares it. */
    readonly anchor: string
    /** From a rule still to come to the live rule it replaces, which stays live until then. */
    readonly replaces: Words
  }
  readonly attributes: {
    /** Disciplines mapped to the iterations their work on the node is planned into. */
    readonly activity: string
    /** An iteration's first and last day (ISO dates). */
    readonly start: string
    readonly end: string
    /** The day a milestone was recorded as met (an ISO date). */
    readonly met: string
    /** The attribute whose value (one of `qualities`) marks a quality requirement of any kind. */
    readonly quality: string
  }
  /** Values of the `quality` attribute that make a node an architectural driver. */
  readonly qualities: Words
  /**
   * The order of the maturities of work still to come, lowest first. sdp reads no meaning into a
   * rung: any maturity says that the work is still to come, and the ladder orders the values a query
   * compares, a value off it below every rung.
   */
  readonly maturity: Words
  /** Disciplines and the kinds whose planned nodes are, by default, work in each. */
  readonly disciplines: ReadonlyMap<string, Words>
  /**
   * Words of the workspace's own that nothing in its graph has yet. An assertion names only words
   * sdp knows — or a typo would pass — so a rule that there is none of something declares its word here.
   */
  readonly words: { readonly kinds: Words; readonly relations: Words; readonly attributes: Words }
}

/** What an empty configuration means. */
export const defaultVocabulary: Vocabulary = {
  kinds: {
    feature: ["feature"],
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
    plan: ["iteration"],
    phase: ["phase"],
    closes: ["closes"],
    scenario: "verifies",
    anchor: "is",
    replaces: ["replaces"]
  },
  attributes: {
    activity: "activity",
    start: "start",
    end: "end",
    met: "met",
    quality: "type"
  },
  qualities: ["quality", "non-functional", "nfr", "constraint"],
  maturity: ["idea", "draft", "specified", "ready"],
  disciplines: new Map<string, Words>([
    ["business-modeling", ["capability", "goal", "actor", "business-process", "vision", "stakeholder"]],
    ["requirements", ["requirement", "nfr", "feature", "story", "use-case", "epic"]],
    ["analysis-design", ["element", "pattern"]],
    // No kind is implementation or test work by itself: a spec plans them with `@activity.<discipline>:`.
    ["implementation", []],
    ["test", []],
    ["deployment", ["environment", "deployment"]]
  ]),
  words: { kinds: [], relations: [], attributes: [] }
}

/** Whether a word can be the key of a tag, `@key=value` or `@rel:ID`: a letter, then letters, digits, `_` or `-`, in parts joined by single dots. */
export const isKey = (word: string): boolean => /^[A-Za-z][\w-]*(?:\.[\w-]+)*$/.test(word)

/** Whether a word can be the value of a tag, as a kind or a maturity is, and an inherited Cucumber tag: no space, `@`, `=` or `:`. */
export const isValueWord = (word: string): boolean => /^[^\s@=:]+$/.test(word)

/** Words sdp makes itself. They are not configurable, and authors cannot write them. */
export const made = {
  kinds: {
    scenario: "scenario",
    /** A `Rule:` of a spec: what must hold, with its scenarios as examples. */
    rule: "rule",
    /** An annotated declaration or file. */
    code: "code",
    /** What an unresolved reference points at. */
    missing: "missing"
  },
  relations: {
    /** From a rule to the spec it is a rule of. */
    rule: "rule-of",
    /** From an element to one it calls: a module anchored to the first imports a value from a module anchored to the second. */
    imports: "imports"
  },
  /** The Cucumber tags sdp reads: a gate, a scenario that runs alone, a rule or scenario that is still a question. */
  tags: { gate: "@gate", serial: "@serial", open: "@open" },
  /**
   * Facts sdp computes on the nodes authors declare; writing one is a `derived-attribute` error.
   * `toCome` marks work still to come, and `rulesToCome` counts a spec's rules still to come.
   */
  attributes: ["stage", "verification", "scenarios", "summary", "file", "openQuestions", "toCome", "rulesToCome"],
  /** Facts sdp computes on scenario nodes. */
  scenarioAttributes: ["spec", "keyword", "tags", "description", "rule", "steps", "examples", "status", "staleBecause", "lastRun", "hash", "toCome"],
  /** Facts sdp computes on rule nodes. */
  ruleAttributes: ["spec", "description", "tags", "scenarios", "verification", "stage", "toCome"],
  /** What sdp records on a code node: where the annotated declaration is, what its own comment says of it, and its shape or a file's exports. */
  codeAttributes: ["file", "symbol", "doc", "shape", "exports"],
  /** The attributes a node has only through scenario results, on any kind; a scenario's `status` is one more. */
  resultAttributes: ["stage", "verification", "staleBecause", "lastRun"],
  /** When a scenario's result was recorded: shown to readers, never to a scenario that runs. */
  recordedAt: "lastRun",
  /**
   * Where live work is in delivery, as its examples say (the decision declared-maturity-derived-stage):
   * not run yet, failing, run in part, or verified. Work still to come is at the stage its maturity names.
   */
  stages: { unrun: "unrun", failing: "failing", inProgress: "in-progress", verified: "verified" }
} as const

/**
 * Names no link may have. A link reads as an attribute of the node it starts from
 * (ARCH-graph-builder), so one named like a fact sdp derives, like the maturity it checks or like
 * the status a listing shows would pass for that fact.
 */
export const reservedRelations: ReadonlyArray<string> = [...made.attributes, "maturity", "status"]

/**
 * The rung that once said work was built. A live test declares no maturity, so this one would say
 * the opposite of what its author meant: it is reported, and no ladder may have it.
 */
export const retiredMaturity = "implemented"

/**
 * Whether a declared maturity makes work still to come: any value does, whatever it is, and a
 * Feature or a Rule that declares none is live.
 */
export const isToCome = (maturity: unknown): boolean => maturity !== undefined

/** The word a role is written with — its first; a valid profile gives every role one. */
export const wordFor = (words: Words): string => words[0]!

export type KindRole = Exclude<keyof Vocabulary["kinds"], "anchored">
export type RelationRole = "plan" | "phase" | "closes" | "replaces"

/** Whether `kind` plays `role`, e.g. `hasKind(v, "decision", node.kind)`. */
export const hasKind = (vocabulary: Vocabulary, role: KindRole, kind: string): boolean => vocabulary.kinds[role].includes(kind)

/** Whether `rel` plays `role`, e.g. `hasRelation(v, "plan", edge.rel)`. */
export const hasRelation = (vocabulary: Vocabulary, role: RelationRole, rel: string): boolean => vocabulary.relations[role].includes(rel)

/** The plan's own nodes — phases, iterations, milestones: they say when, and are no work themselves. */
export const isPlanKind = (vocabulary: Vocabulary, kind: string): boolean =>
  hasKind(vocabulary, "phase", kind) || hasKind(vocabulary, "iteration", kind) || hasKind(vocabulary, "milestone", kind)

/** A node's own attribute, never one inherited from `Object.prototype` (`constructor` is a legal name). */
export const attribute = (node: { readonly attrs: Readonly<Record<string, unknown>> }, key: string): unknown =>
  Object.hasOwn(node.attrs, key) ? node.attrs[key] : undefined

/** Architectural drivers: kinds that are drivers, and any node whose quality attribute says it is one. */
export const isDriver = (vocabulary: Vocabulary, node: { readonly kind: string; readonly attrs: Readonly<Record<string, unknown>> }): boolean => {
  const quality = attribute(node, vocabulary.attributes.quality)
  return hasKind(vocabulary, "driver", node.kind) ||
    (typeof quality === "string" && vocabulary.qualities.includes(quality.toLowerCase()))
}

/** The relations sdp reads the plan from: the plan, phase and closing relations. */
export const linkKeys = (vocabulary: Vocabulary): Words =>
  [...new Set([...vocabulary.relations.plan, ...vocabulary.relations.phase, ...vocabulary.relations.closes])]

/** Whether a key only links: a relation of the plan, a replacement, or a discipline under `activity` (`activity.test`). */
export const isLinkKey = (vocabulary: Vocabulary, key: string): boolean =>
  linkKeys(vocabulary).includes(key) || vocabulary.relations.replaces.includes(key) || key.startsWith(`${vocabulary.attributes.activity}.`)

/** Whether a value is a day of the calendar written YYYY-MM-DD: `2026-02-30` is not one. */
const isDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value)
}

/** The day a node's attribute holds, such as an iteration's `end`; anything but a day of the calendar holds none. */
export const dayOf = (node: { readonly attrs: Readonly<Record<string, unknown>> }, key: string): string | undefined => {
  const value = attribute(node, key)
  return isDay(value) ? value : undefined
}

/** The day a milestone was recorded as met. Anything but a day of the calendar written there records nothing. */
export const metOn = (vocabulary: Vocabulary, node: { readonly attrs: Readonly<Record<string, unknown>> }): string | undefined =>
  dayOf(node, vocabulary.attributes.met)

/** The relation of a planned discipline's edge: `activity.implementation`. */
export const activityRelation = (vocabulary: Vocabulary, discipline: string): string => `${vocabulary.attributes.activity}.${discipline}`

/** Whether an attribute is one sdp computes on nodes of `kind`. */
export const isDerived = (kind: string, key: string): boolean =>
  (made.attributes as ReadonlyArray<string>).includes(key) ||
  (kind === made.kinds.scenario && (made.scenarioAttributes as ReadonlyArray<string>).includes(key)) ||
  (kind === made.kinds.rule && (made.ruleAttributes as ReadonlyArray<string>).includes(key))

/** Every word the profile names, by what it is: for the unknown words of queries and the guard of ARCH-vocabulary. */
export const vocabularyWords = (vocabulary: Vocabulary) => ({
  kinds: [...new Set([...Object.values(vocabulary.kinds).flat(), ...[...vocabulary.disciplines.values()].flat(), ...vocabulary.words.kinds])],
  relations: [...new Set([...Object.values(vocabulary.relations).flat(), ...linkKeys(vocabulary), ...vocabulary.words.relations])],
  attributes: [...new Set([...Object.values(vocabulary.attributes), ...vocabulary.words.attributes])],
  /** Attribute values the profile names: the qualities. Maturities compare only along the ladder. */
  values: [...vocabulary.qualities],
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
    /** The attributes of a rule node. */
    ruleAttributes: made.ruleAttributes,
    /** The relations sdp makes: from a rule to its spec, and from an element to those it imports code from. */
    relations: Object.values(made.relations),
    /** The Cucumber tags sdp reads. */
    tags: Object.values(made.tags),
    /** The attributes of a code node. */
    codeAttributes: made.codeAttributes,
    /** The stages beyond the maturity ladder. */
    stages: Object.values(made.stages),
    /** The names no link can have. */
    reservedRelations
  }
})
