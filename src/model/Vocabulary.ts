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
    /** The kinds of the specs that hold the architecture's rules: what only the code observes, such as which element may import which. */
    readonly architecture: Words
    /** Architectural drivers, shown next to the architecture they shape: a team that keeps quality requirements as specs of a kind of its own names that kind here. */
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
    /** The relation of the code annotation that anchors a node in code and declares it. */
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
    /** The attribute whose value (one of `qualities`) marks a rule or a spec as a quality requirement. */
    readonly quality: string
  }
  /** Values of the `quality` attribute that make a node an architectural driver. */
  readonly qualities: Words
  /**
   * The rungs of the ladder of work still to come, lowest first: a maturity is one of them, as
   * written, and `sdp check` reports any other word as an error. sdp reads no meaning into a rung:
   * any maturity says that the work is still to come, and the ladder orders the values a query compares.
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

const defaultKinds: Vocabulary["kinds"] = {
  feature: ["feature"],
  decision: ["decision"],
  milestone: ["milestone"],
  phase: ["phase"],
  iteration: ["iteration"],
  pattern: ["pattern"],
  architectural: ["element", "pattern"],
  architecture: ["architecture"],
  driver: ["decision"],
  anchored: "element"
}

/**
 * The disciplines of a workspace that names none of its own, and the kinds whose planned nodes are
 * work in each: its features are requirements work, and its architecture and the rules of it
 * analysis and design, in the words its vocabulary gives them.
 */
export const defaultDisciplines = (kinds: Vocabulary["kinds"]): ReadonlyMap<string, Words> =>
  new Map<string, Words>([
    ["business-modeling", ["capability", "goal", "actor", "business-process", "vision", "stakeholder"]],
    ["requirements", [...new Set(["requirement", ...kinds.feature, "story", "use-case", "epic"])]],
    ["analysis-design", [...new Set([...kinds.architectural, ...kinds.pattern, ...kinds.architecture])]],
    // No kind is implementation or test work by itself: a spec plans them with `@activity.<discipline>:`.
    ["implementation", []],
    ["test", []],
    ["deployment", ["environment", "deployment"]]
  ])

/** What an empty configuration means. */
export const defaultVocabulary: Vocabulary = {
  kinds: defaultKinds,
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
  qualities: ["quality"],
  maturity: ["idea", "draft", "specified", "ready"],
  disciplines: defaultDisciplines(defaultKinds),
  words: { kinds: [], relations: [], attributes: [] }
}

/** Whether a word can be the key of a tag, `@key=value` or `@rel:ID`: a letter, then letters, digits, `_` or `-`, in parts joined by single dots. */
export const isKey = (word: string): boolean => /^[A-Za-z][\w-]*(?:\.[\w-]+)*$/.test(word)

/** Whether a word can be the value of a tag, as a kind or a maturity is, and an inherited Cucumber tag: no space, `@`, `=` or `:`. */
export const isValueWord = (word: string): boolean => /^[^\s@=:]+$/.test(word)

/** The characters of the words of an id, in any script: letters, the marks attached to them, and digits. */
const idWord = String.raw`\p{L}\p{M}\p{N}`

/**
 * An id, as sdp makes one — a slug, a new spec's — and as a tag reads one, `@id=` in a spec and
 * `@sdp <rel> <ID>` in code: a letter or a digit, then the characters of words and `-`, `_`, `.`,
 * `:`, `#` and `/`, but for a full stop at its end, which ends a sentence.
 */
export const idSyntax = String.raw`[\p{L}\p{N}](?:[${idWord}_.:#/-]*[${idWord}_:#/-])?`

const wholeId = new RegExp(`^(?:${idSyntax})$`, "u")

/** Whether `text` is an id (`idSyntax`), which every tag that names one reads back. */
export const isId = (text: string): boolean => wholeId.test(text)

/** What an id is, as a hint says it. */
export const idForm =
  "a letter or a digit, then letters, digits and - _ . : / in any script, # only before the name of a rule or an example, and no full stop at its end"

/** What lies between the words of an id, so a slug is the words of its title split there. */
export const idWordBreak = new RegExp(`[^${idWord}]+`, "u")

/** The attribute that holds the Cucumber tags of a Feature, a Rule or a Scenario as written, each with its `@`. */
const tagsKey = "tags"

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
  /** The attribute that holds the Cucumber tags of a Feature, a Rule or a Scenario as written, each with its `@`. */
  tagsKey,
  /**
   * Facts sdp computes on the nodes authors declare; writing one is a `derived-attribute` error.
   * `tags` holds the Cucumber tags of a Feature, a Rule or a Scenario as written, `toCome` marks work
   * still to come, and `rulesToCome` counts a spec's rules still to come.
   */
  attributes: ["stage", "scenarios", "summary", "file", tagsKey, "openQuestions", "toCome", "rulesToCome"],
  /** Facts sdp computes on scenario nodes. */
  scenarioAttributes: ["spec", "keyword", tagsKey, "description", "rule", "steps", "examples", "status", "staleBecause", "lastRun", "hash", "toCome"],
  /** Facts sdp computes on rule nodes. */
  ruleAttributes: ["spec", "description", tagsKey, "scenarios", "stage", "toCome"],
  /** What sdp records on a code node: where the annotated declaration is, what its own comment says of it, and its shape or a file's exports. */
  codeAttributes: ["file", "symbol", "doc", "shape", "exports"],
  /** The attributes a node has only through scenario results, on any kind; a scenario's `status` is one more. */
  resultAttributes: ["stage", "staleBecause", "lastRun"],
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

/** Whether a word names a stage sdp derives from a run, in any case: no rung of a ladder can. */
export const isStage = (word: string): boolean => (Object.values(made.stages) as ReadonlyArray<string>).includes(word.toLowerCase())

/**
 * What to write instead of a maturity that is no rung of the ladder, or `undefined` for a rung. A
 * maturity is checked only to be a rung, as written, never for what it claims: a word for built work
 * is no rung like any other, and only a stage has a hint of its own, for sdp derives it from the run.
 */
export const offLadder = (vocabulary: Vocabulary, maturity: string): string | undefined => {
  if (vocabulary.maturity.includes(maturity)) return undefined
  const rung = vocabulary.maturity.find((candidate) => candidate.toLowerCase() === maturity.toLowerCase())
  return isStage(maturity)
    ? `sdp derives ${maturity} from the run`
    : rung !== undefined
    ? `write ${rung}, as the ladder does`
    : `write a rung of the ladder, or add ${maturity} to it under vocabulary.maturity`
}

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

/**
 * Whether nodes of a kind are work: what a discipline names, which is still to come at a maturity
 * and planned. Any other kind is what it is, live, and nothing plans it.
 */
export const isWork = (vocabulary: Vocabulary, kind: string): boolean =>
  [...vocabulary.disciplines.values()].some((kinds) => kinds.includes(kind))

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
    /** The stages beyond the maturity ladder, which no rung can be. */
    stages: Object.values(made.stages),
    /** The names no link can have. */
    reservedRelations
  }
})
