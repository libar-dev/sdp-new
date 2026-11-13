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
  }
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
  driver: ["decision"],
  anchored: "element"
}

/**
 * The disciplines of a workspace that names none of its own, and the kinds whose planned nodes are
 * work in each: its features are requirements work, and its architecture and the specs of the rules
 * its code keeps analysis and design, in the words its vocabulary gives them. They name only the
 * kinds sdp's own specs need: a rule is a feature's requirement and a story is a slice of delivery,
 * no spec, so a team that writes either as a kind of its own names it here.
 */
export const defaultDisciplines = (kinds: Vocabulary["kinds"]): ReadonlyMap<string, Words> =>
  new Map<string, Words>([
    ["business-modeling", ["vision"]],
    ["requirements", [...kinds.feature]],
    ["analysis-design", [...new Set([...kinds.architectural, ...kinds.pattern, "architecture"])]],
    // No kind is implementation or test work by itself: a spec plans them with `@activity.<discipline>:`.
    ["implementation", []],
    ["test", []],
    ["deployment", ["environment"]]
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
    met: "met"
  },
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
  /**
   * The Cucumber tags sdp reads: a gate, a scenario that runs alone, a rule or scenario that is still
   * a question, and a rule or a spec that is a quality requirement, whose examples inherit the tag.
   */
  tags: { gate: "@gate", serial: "@serial", open: "@open", quality: "@quality" },
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

/**
 * What an end of a typed link, or the node a typed fact is written on, may be: a role of the
 * profile, so a workspace's renames follow it, or a kind the way of working names (`epic`).
 */
export type End =
  | "feature"
  | "decision"
  | "element"
  | "pattern"
  | "iteration"
  | "phase"
  | "milestone"
  | "epic"
  | "work"
  | "rule"
  | "scenario"
  | "spec"
  | "code"

/**
 * The type of a word that joins two nodes: the kinds each end may be. `checked` names, per end, the
 * rule of check that already holds that end to its type, so that check reports a link once.
 */
export interface LinkType {
  readonly from: ReadonlyArray<End>
  readonly to: ReadonlyArray<End>
  readonly checked?: { readonly from?: string; readonly to?: string }
}

/** The relations the way of working teaches and sdp only carries, by their one spelling. */
const carriedLinkTypes: ReadonlyArray<readonly [string, LinkType]> = [
  ["realized-by", { from: ["feature"], to: ["element"] }],
  ["decided-by", { from: ["spec", "rule"], to: ["decision"] }],
  ["depends-on", { from: ["feature"], to: ["feature"] }],
  ["includes", { from: ["epic"], to: ["feature", "rule"] }],
  ["applies", { from: ["code", "element"], to: ["pattern"] }]
]

/**
 * The types of the words that join two nodes, by the words the workspace gives each role: a word a
 * role is bound to has that role's type, every alias of it too, and a carried word bound to a role
 * has the role's type alone. A relation not listed joins any nodes, as the decision free-vocabulary
 * has it. A map, so that an author's word such as `constructor` names nothing it does not hold.
 */
export const linkTypes = (vocabulary: Vocabulary): ReadonlyMap<string, LinkType> => {
  const { plan, phase, closes, replaces, anchor, scenario } = vocabulary.relations
  const roles: ReadonlyArray<readonly [Words, LinkType]> = [
    [plan, { from: ["work", "rule"], to: ["iteration"], checked: { from: "plan-reference", to: "plan-reference" } }],
    [phase, { from: ["iteration"], to: ["phase"], checked: { to: "plan-reference" } }],
    [closes, { from: ["milestone"], to: ["iteration", "phase"], checked: { to: "plan-reference" } }],
    [replaces, { from: ["feature", "rule", "scenario"], to: ["feature", "rule", "scenario"], checked: { from: "replacement", to: "replacement" } }],
    // An anchor declares the node it names, of the kind it writes: any spec's kind, not only an element's.
    [[anchor], { from: ["code"], to: ["spec"] }],
    [[scenario], { from: ["scenario"], to: ["spec", "rule"] }]
  ]
  const types = new Map<string, LinkType>()
  for (const [words, type] of roles) for (const word of words) if (!types.has(word)) types.set(word, type)
  for (const [word, type] of carriedLinkTypes) if (!types.has(word)) types.set(word, type)
  return types
}

/** The type of a fact that takes a value: what the value is, and the kinds it is written on. */
export interface FactType {
  readonly value: "rung" | "day"
  readonly on: ReadonlyArray<End>
}

/**
 * The types of the facts that take a value, by the words the workspace gives them. A maturity is a
 * rung of the ladder (`maturity-off-ladder`) on work (`maturity-on-no-work`); a day is one of the
 * calendar (`plan-date`, `milestone-met`) on what it dates, and `fact-kind` reports one written on
 * anything else, where it says nothing. An iteration starts and ends, and a milestone is met; a
 * phase is dated by its iterations. Two roles given one word share it, so it may be written on what
 * either dates.
 */
export const factTypes = (vocabulary: Vocabulary): ReadonlyMap<string, FactType> => {
  const { start, end, met } = vocabulary.attributes
  const types = new Map<string, FactType>([["maturity", { value: "rung", on: ["work", "rule"] }]])
  for (const [word, on] of [[start, ["iteration"]], [end, ["iteration"]], [met, ["milestone"]]] as const) {
    const known = types.get(word)
    types.set(word, { value: "day", on: [...new Set([...(known?.on ?? []), ...on])] })
  }
  return types
}

/** Whether a node of `kind` is an end of that sort, in the workspace's words. */
export const isEnd = (vocabulary: Vocabulary, end: End, kind: string): boolean => {
  switch (end) {
    case "feature":
    case "decision":
    case "pattern":
    case "iteration":
    case "phase":
    case "milestone":
      return hasKind(vocabulary, end, kind)
    case "element":
      return hasKind(vocabulary, "architectural", kind) && !hasKind(vocabulary, "pattern", kind)
    case "work":
      return isWork(vocabulary, kind)
    case "spec":
      return !(Object.values(made.kinds) as ReadonlyArray<string>).includes(kind)
    case "rule":
      return kind === made.kinds.rule
    case "scenario":
      return kind === made.kinds.scenario
    case "code":
      return kind === made.kinds.code
    case "epic":
      return kind === "epic"
  }
}

/** A kind with its indefinite article, an element, a decision; work and code are counted by no article. */
export const withArticle = (word: string): string =>
  ["work", "code"].includes(word) ? word : `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`

/** The kinds an end may be, each with its article, as a message says them: work or a rule. */
export const endPhrase = (vocabulary: Vocabulary, ends: ReadonlyArray<End>): string =>
  endWords(vocabulary, ends).split(" or ").map(withArticle).join(" or ")

/** The kinds an end may be, in the workspace's words, as a hint says them. */
export const endWords = (vocabulary: Vocabulary, ends: ReadonlyArray<End>): string =>
  ends.map((end) => {
    switch (end) {
      case "element":
        return vocabulary.kinds.architectural.filter((kind) => !vocabulary.kinds.pattern.includes(kind)).join(" or ") || end
      case "feature":
      case "decision":
      case "pattern":
      case "iteration":
      case "phase":
      case "milestone":
        return vocabulary.kinds[end].join(" or ")
      default:
        return end
    }
  }).join(" or ")

/** Words sdp once read and reads no more: a change to a feature is rules of it, not a spec of kind change. */
export const retired = { kinds: ["change"] } as const

/**
 * Why a word cannot be a kind, or `undefined` for one that can: a rung of the ladder or a stage says
 * how far work has come, and a kind sdp retired is read no more — each unless the workspace names a
 * kind of that name, in its vocabulary or among the kinds its `ids` give a prefix (`named`). `is` says
 * which, for what to write instead. Any other word is the authors' (the decision free-vocabulary);
 * `sdp check` reports what this names where it is written, and `sdp new` refuses it.
 */
export const notAKind = (
  vocabulary: Vocabulary,
  kind: string,
  named: ReadonlyArray<string> = []
): { readonly is: "rung" | "stage" | "retired"; readonly reason: string } | undefined =>
  vocabularyWords(vocabulary).kinds.includes(kind) || named.includes(kind)
    ? undefined
    : vocabulary.maturity.includes(kind)
    ? { is: "rung", reason: `${kind} is a maturity, not a kind` }
    : isStage(kind)
    ? { is: "stage", reason: `${kind} is a stage sdp derives from the run, not a kind` }
    : (retired.kinds as ReadonlyArray<string>).includes(kind)
    ? { is: "retired", reason: `a ${kind} is rules of the ${wordFor(vocabulary.kinds.feature)} it changes, not a kind` }
    : undefined

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

/**
 * Whether a kind's specs hold the rules its code keeps, such as which element may import which:
 * work of a discipline the architecture's own kinds are work of, but no element or pattern, which
 * code declares — `architecture` by default.
 */
export const holdsCodeRules = (vocabulary: Vocabulary, kind: string): boolean =>
  !hasKind(vocabulary, "architectural", kind) &&
  [...vocabulary.disciplines.values()].some((kinds) => kinds.includes(kind) && vocabulary.kinds.architectural.some((own) => kinds.includes(own)))

/** The plan's own nodes — phases, iterations, milestones: they say when, and are no work themselves. */
export const isPlanKind = (vocabulary: Vocabulary, kind: string): boolean =>
  hasKind(vocabulary, "phase", kind) || hasKind(vocabulary, "iteration", kind) || hasKind(vocabulary, "milestone", kind)

/** A node's own attribute, never one inherited from `Object.prototype` (`constructor` is a legal name). */
export const attribute = (node: { readonly attrs: Readonly<Record<string, unknown>> }, key: string): unknown =>
  Object.hasOwn(node.attrs, key) ? node.attrs[key] : undefined

/** Architectural drivers: kinds that are drivers, and any rule or spec tagged as a quality requirement. */
export const isDriver = (vocabulary: Vocabulary, node: { readonly kind: string; readonly attrs: Readonly<Record<string, unknown>> }): boolean => {
  const tags = attribute(node, made.tagsKey)
  return hasKind(vocabulary, "driver", node.kind) || (Array.isArray(tags) && tags.includes(made.tags.quality))
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
    /** The kinds sdp reads no more, which no spec can have unless the workspace names one. */
    retiredKinds: retired.kinds,
    /** The names no link can have. */
    reservedRelations
  },
  /** What each typed word joins or is written on, in the workspace's words. */
  types: {
    links: Object.fromEntries([...linkTypes(vocabulary)].map(([rel, type]) => [
      rel,
      { from: endWords(vocabulary, type.from).split(" or "), to: endWords(vocabulary, type.to).split(" or ") }
    ])),
    facts: Object.fromEntries([...factTypes(vocabulary)].map(([fact, type]) => [
      fact,
      { value: type.value, on: endWords(vocabulary, type.on).split(" or ") }
    ]))
  }
})
