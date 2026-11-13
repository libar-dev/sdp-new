import { Duration, Option, Result, Schema, Struct } from "effect"
import { defaultDisciplines, defaultVocabulary, isKey, isStage, isValueWord, made, reservedRelations, Vocabulary } from "./Vocabulary.ts"

const Globs = Schema.Array(Schema.String)

/**
 * The `vocabulary:` section: every role is optional and replaces its default.
 * Only role groups are partial; a dictionary of disciplines keeps its complete values.
 * Keep each group's annotation when deriving its optional fields.
 */
const VocabularyFile = Vocabulary
  .mapFields(Struct.map(Schema.optional))
  .mapFields((fields) => ({
    ...fields,
    kinds: Schema.optional(
      Vocabulary.fields.kinds
        .mapFields(
          Struct.map(Schema.optional)
        )
        .annotate(Schema.resolveAnnotations(Vocabulary.fields.kinds) ?? {})
    ),
    relations: Schema.optional(
      Vocabulary.fields.relations
        .mapFields(
          Struct.map(Schema.optional)
        )
        .annotate(Schema.resolveAnnotations(Vocabulary.fields.relations) ?? {})
    ),
    attributes: Schema.optional(
      Vocabulary.fields.attributes
        .mapFields(
          Struct.map(Schema.optional)
        )
        .annotate(Schema.resolveAnnotations(Vocabulary.fields.attributes) ?? {})
    ),
    words: Schema.optional(
      Vocabulary.fields.words
        .mapFields(
          Struct.map(Schema.optional)
        )
        .annotate(Schema.resolveAnnotations(Vocabulary.fields.words) ?? {})
    )
  }))
type VocabularyFile = typeof VocabularyFile.Type

/**
 * Shape of `sdp.config.yaml`. Every key is optional; see `defaults` for what an empty file means.
 *
 * @sdp is ARCH-workspace
 */
export const ConfigFile = Schema.Struct({
  features: Schema.optional(Globs),
  code: Schema.optional(Globs),
  steps: Schema.optional(Globs),
  exclude: Schema.optional(Globs),
  evidence: Schema.optional(Schema.Struct({
    inputs: Schema.optional(Globs),
    env: Schema.optional(Schema.Array(Schema.String))
  })),
  results: Schema.optional(Schema.String),
  // A number alone is read so that it is refused for its missing unit, not for its type.
  timeout: Schema.optional(Schema.Union([Schema.String, Schema.Number])),
  ids: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  base: Schema.optional(Schema.String),
  vocabulary: Schema.optional(VocabularyFile)
}).check(Schema.makeFilter((file) => configProblems(file)))
export type ConfigFile = typeof ConfigFile.Type

export interface Config {
  readonly features: ReadonlyArray<string>
  readonly code: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
  /** What scenarios run against besides the code: a result goes stale when any of it changes. */
  readonly evidence: {
    /** Files the steps read while running — fixtures, data — as globs. */
    readonly inputs: ReadonlyArray<string>
    /** Environment variables the steps read; only a digest of their values is stored. */
    readonly env: ReadonlyArray<string>
  }
  /** Where `sdp run` stores scenario results, relative to the workspace root. */
  readonly results: string
  /** How long a step may take before it fails, unless `--timeout` says otherwise. */
  readonly timeout: Duration.Duration
  /** Id prefixes used by `sdp new` and to infer a kind, keyed by kind (a record without a prototype). */
  readonly ids: Readonly<Record<string, string>>
  /**
   * The git revision `sdp check` compares live tests with, where HEAD meets it; when none is
   * named, the repository's default branch, and `none` waives the comparison.
   */
  readonly base: string | undefined
  /** The words sdp interprets (ARCH-vocabulary). */
  readonly vocabulary: Vocabulary
}

const sourceGlob = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py,go,java,kt,cs,rs,rb,scala,swift,php}"

/** Builds a record without a prototype, so a kind named `constructor` is just a key. */
const record = <V>(entries: Iterable<readonly [string, V]>): Readonly<Record<string, V>> => {
  const out: Record<string, V> = Object.create(null)
  for (const [key, value] of entries) out[key] = value
  return out
}

/** The kinds whose ids keep a prefix; any other kind, a feature first, is named by its id alone. */
const defaultIds: ReadonlyArray<readonly [string, string]> = [
  ["element", "ARCH"],
  ["pattern", "PAT"],
  ["milestone", "MS"],
  ["phase", "PH"],
  ["iteration", "IT"]
]

export const defaults: Config = {
  features: ["**/*.feature"],
  code: [`src/${sourceGlob}`, `lib/${sourceGlob}`, `app/${sourceGlob}`, `packages/${sourceGlob}`],
  steps: ["**/*.steps.{ts,mts,js,mjs}"],
  exclude: ["**/node_modules/**", ".sdp/**", "**/dist/**", "**/build/**", ".git/**"],
  evidence: { inputs: [], env: [] },
  results: ".sdp/results.json",
  timeout: Duration.seconds(30),
  ids: record(defaultIds),
  base: undefined,
  vocabulary: defaultVocabulary
}

/**
 * Each role the file names replaces its default; disciplines merge one by one, over defaults that
 * name the kinds in the file's words.
 */
const resolveVocabulary = (file: VocabularyFile | undefined): Vocabulary => {
  const d = defaultVocabulary
  if (!file) return d
  const kinds = { ...d.kinds, ...file.kinds }
  return {
    kinds,
    relations: { ...d.relations, ...file.relations },
    attributes: { ...d.attributes, ...file.attributes },
    maturity: file.maturity ?? d.maturity,
    disciplines: { ...defaultDisciplines(kinds), ...file.disciplines },
    words: { ...d.words, ...file.words }
  }
}

export const resolveConfig = (file: ConfigFile | undefined): Config => {
  if (!file) return defaults
  return {
    features: file.features ?? defaults.features,
    code: file.code ?? defaults.code,
    steps: file.steps ?? defaults.steps,
    exclude: [...defaults.exclude, ...(file.exclude ?? [])],
    evidence: {
      inputs: file.evidence?.inputs ?? defaults.evidence.inputs,
      env: file.evidence?.env ?? defaults.evidence.env
    },
    results: file.results ?? defaults.results,
    timeout: file.timeout === undefined ? defaults.timeout : Result.getOrElse(readTimeout(String(file.timeout)), () => defaults.timeout),
    ids: record([...defaultIds, ...Object.entries(file.ids ?? {})]),
    base: file.base,
    vocabulary: resolveVocabulary(file.vocabulary)
  }
}

/**
 * What makes a vocabulary one sdp cannot work with, each problem at its path under `vocabulary`:
 * a word that says nothing or that no tag can hold, a role without a word, and roles that
 * contradict each other — a word sdp makes or reads itself given to an author's role, or one word
 * for a relation sdp makes and one authors write.
 */
const vocabularyProblems = (file: VocabularyFile): ReadonlyArray<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = []
  const problem = (path: ReadonlyArray<string>, issue: string) => issues.push({ path: ["vocabulary", ...path], issue })
  const blank = (value: unknown, path: ReadonlyArray<string>): void => {
    if (typeof value === "string" && value.trim() === "") problem(path, "a word cannot be empty")
    else if (Array.isArray(value)) value.forEach((item) => blank(item, path))
    else if (typeof value === "object" && value !== null) Object.entries(value).forEach(([key, item]) => blank(item, [...path, key]))
  }
  blank(file, [])

  const v = resolveVocabulary(file)
  const { anchored, ...kindRoles } = v.kinds
  const { anchor, scenario, ...relationRoles } = v.relations
  const roles: ReadonlyArray<readonly [path: ReadonlyArray<string>, words: ReadonlyArray<string>]> = [
    ...Object.entries(kindRoles).map(([role, words]) => [["kinds", role], words] as const),
    ...Object.entries(relationRoles).map(([role, words]) => [["relations", role], words] as const)
  ]
  for (const [path, words] of roles) if (words.length === 0) problem(path, "a role needs at least one word")

  // A relation, an attribute or a discipline under `activity` is the key of a tag; a kind or a
  // maturity is its value. An empty word is reported above.
  const said = (words: string | ReadonlyArray<string>): ReadonlyArray<string> => [words].flat().filter((word) => word.trim() !== "")
  const keys: ReadonlyArray<readonly [path: ReadonlyArray<string>, words: ReadonlyArray<string>]> = [
    ...Object.entries(v.relations).map(([role, words]) => [["relations", role], said(words)] as const),
    ...Object.entries(v.attributes).map(([role, word]) => [["attributes", role], said(word)] as const),
    [["disciplines"], Object.keys(v.disciplines).map((discipline) => `${v.attributes.activity}.${discipline}`)]
  ]
  for (const [path, words] of keys) {
    for (const word of words.filter((candidate) => !isKey(candidate))) {
      problem(path, `\`${word}\` cannot be the key of a tag: write a letter, then letters, digits, _ or -, in parts joined by single dots`)
    }
  }
  const values: ReadonlyArray<readonly [path: ReadonlyArray<string>, words: ReadonlyArray<string>]> = [
    ...Object.entries(v.kinds).map(([role, words]) => [["kinds", role], said(words)] as const),
    [["maturity"], said(v.maturity)]
  ]
  for (const [path, words] of values) {
    for (const word of words.filter((candidate) => !isValueWord(candidate))) {
      problem(path, `\`${word}\` cannot be the value of a tag: write it without a space, @, = or :`)
    }
  }

  const madeKinds: ReadonlyArray<string> = Object.values(made.kinds)
  for (const [role, words] of Object.entries({ ...kindRoles, anchored: [anchored] })) {
    for (const kind of words.filter((word) => madeKinds.includes(word))) {
      problem(["kinds", role], `${kind} is a kind sdp makes itself, so no author's node can play this role with it`)
    }
  }

  // The names sdp reads or derives on every node are taken: by no relation, and by no other attribute.
  const named: ReadonlyArray<readonly [path: ReadonlyArray<string>, words: ReadonlyArray<string>]> = [
    ...Object.entries(v.relations).map(([role, words]) => [["relations", role], [words].flat()] as const),
    ...Object.entries(v.attributes).map(([role, word]) => [["attributes", role], [word]] as const)
  ]
  for (const [path, words] of named) {
    for (const word of words.filter((candidate) => reservedRelations.includes(candidate))) {
      problem(path, `${word} is an attribute sdp derives or checks itself, so it cannot be given another meaning`)
    }
  }

  const madeRelations: ReadonlyArray<string> = Object.values(made.relations)
  for (const [role, words] of Object.entries(v.relations)) {
    for (const word of [words].flat().filter((candidate) => madeRelations.includes(candidate))) {
      problem(["relations", role], `${word} is a relation sdp makes itself, so it cannot be given another meaning`)
    }
  }

  // A relation sdp makes or reads on code is no relation authors write in a tag, and no other one of its own.
  const written = Object.values(relationRoles).flat()
  const own = { anchor, scenario }
  for (const [role, word] of Object.entries(own)) {
    const others = Object.entries(own).filter(([other, its]) => other !== role && its === word).map(([other]) => `relations.${other}`)
    if (written.includes(word) || others.length > 0) {
      problem(["relations", role], `${word} is also ${others[0] ?? "a relation of the plan"}; this relation needs a word of its own`)
    }
  }
  return issues
}

/** The units people write a duration with besides Effect's own words: `90s`, `500ms`, `2m`, `1h`. */
const units: Readonly<Record<string, Duration.Unit>> = { ms: "millis", s: "seconds", m: "minutes", h: "hours" }

/**
 * How long a step may take, as `timeout:` or `--timeout` says it — `90s`, `500ms`, `2m`, `1h`, or
 * as Effect writes it, `2 minutes` or `Infinity`, with or without a space — or what is wrong with it.
 */
export const readTimeout = (input: Duration.Input | string): Result.Result<Duration.Duration, string> => {
  const written = typeof input === "string" ? /^(-?\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(input.trim()) : null
  const duration = Duration.fromInput((written ? `${written[1]} ${units[written[2]!] ?? written[2]}` : input) as Duration.Input)
  if (Option.isNone(duration)) return Result.fail("is not a duration: a number and a unit, e.g. 90s, 500ms, 2m or 1h")
  return Duration.isGreaterThan(duration.value, Duration.zero)
    ? Result.succeed(duration.value)
    : Result.fail("is not more than nothing: a step needs some time to run")
}

/**
 * What a configuration must satisfy beyond its shape, each problem at its path: a vocabulary sdp
 * can work with, a maturity ladder of distinct levels none of which is a stage sdp derives,
 * id prefixes that kind inference reads back (letters only, one kind each, none of a kind sdp makes
 * itself), and a timeout that is a duration.
 */
const configProblems = (file: ConfigFile): ReadonlyArray<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = file.vocabulary === undefined ? [] : [...vocabularyProblems(file.vocabulary)]
  const timeout = file.timeout === undefined ? undefined : readTimeout(String(file.timeout))
  if (timeout !== undefined && Result.isFailure(timeout)) issues.push({ path: ["timeout"], issue: `${file.timeout} ${timeout.failure}` })
  const vocabulary = file.vocabulary
  const ladder = vocabulary?.maturity
  if (ladder !== undefined) {
    if (ladder.length === 0) issues.push({ path: ["vocabulary", "maturity"], issue: "the maturity ladder needs at least one level" })
    const repeated = ladder.filter((level, index) => ladder.indexOf(level) !== index)
    if (repeated.length > 0) issues.push({ path: ["vocabulary", "maturity"], issue: `levels must be distinct: ${repeated.join(", ")} repeats` })
    for (const level of ladder.filter(isStage)) {
      issues.push({ path: ["vocabulary", "maturity"], issue: `${level} is a stage sdp derives from the run, so no rung can be one` })
    }
  }
  const madeKinds: ReadonlyArray<string> = Object.values(made.kinds)
  for (const kind of Object.keys(file.ids ?? {}).filter((candidate) => madeKinds.includes(candidate))) {
    issues.push({ path: ["ids", kind], issue: `${kind} is a kind sdp makes itself, so no id an author writes can be of it` })
  }
  const owners = new Map<string, string>()
  for (const [kind, prefix] of [...defaultIds, ...Object.entries(file.ids ?? {})]) {
    if (!/^[A-Za-z]+$/.test(prefix)) {
      issues.push({ path: ["ids", kind], issue: `prefix "${prefix}" must be letters only, so that the kind of an id like ${prefix}-x can be inferred` })
    }
    owners.set(kind, prefix)
  }
  // An id's prefix is matched in its case, but prefixes alike but for their case are one to whoever reads an id.
  const byPrefix = new Map<string, Array<readonly [kind: string, prefix: string]>>()
  for (const [kind, prefix] of owners) byPrefix.set(prefix.toLowerCase(), [...(byPrefix.get(prefix.toLowerCase()) ?? []), [kind, prefix]])
  for (const sharing of byPrefix.values()) {
    if (sharing.length < 2) continue
    const [prefix, ...cases] = [...new Set(sharing.map(([, written]) => written))]
    issues.push({
      path: ["ids"],
      issue: `${sharing.map(([kind]) => kind).join(" and ")} share the prefix ${prefix}${
        cases.length > 0 ? `, as ${cases.join(" and ")}, so an id would say its kind only by its case` : ", so an id cannot say which kind it is"
      }`
    })
  }
  return issues
}

export const configFileNames = ["sdp.config.yaml", "sdp.config.yml", "sdp.config.json"] as const
