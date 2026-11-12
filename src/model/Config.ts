import { Schema } from "effect"
import { defaultVocabulary, made, type Vocabulary } from "./Vocabulary.ts"

const Globs = Schema.Array(Schema.String)

const Words = Schema.Array(Schema.String)
const Word = Schema.String

/** The `vocabulary:` section: every role is optional and replaces its default. */
const VocabularyFile = Schema.Struct({
  kinds: Schema.optional(Schema.Struct({
    decision: Schema.optional(Words),
    milestone: Schema.optional(Words),
    phase: Schema.optional(Words),
    iteration: Schema.optional(Words),
    pattern: Schema.optional(Words),
    architectural: Schema.optional(Words),
    driver: Schema.optional(Words),
    anchored: Schema.optional(Word)
  })),
  relations: Schema.optional(Schema.Struct({
    supersedes: Schema.optional(Words),
    plan: Schema.optional(Words),
    phase: Schema.optional(Words),
    mention: Schema.optional(Word),
    scenario: Schema.optional(Word),
    anchor: Schema.optional(Word)
  })),
  attributes: Schema.optional(Schema.Struct({
    activity: Schema.optional(Word),
    order: Schema.optional(Word),
    start: Schema.optional(Word),
    end: Schema.optional(Word),
    quality: Schema.optional(Word)
  })),
  qualities: Schema.optional(Words),
  statuses: Schema.optional(Schema.Struct({
    decision: Schema.optional(Words),
    accepted: Schema.optional(Word),
    superseded: Schema.optional(Word),
    inactive: Schema.optional(Words)
  })),
  maturity: Schema.optional(Words),
  disciplines: Schema.optional(Schema.Record(Schema.String, Words)),
  links: Schema.optional(Words),
  words: Schema.optional(Schema.Struct({
    kinds: Schema.optional(Words),
    relations: Schema.optional(Words),
    attributes: Schema.optional(Words)
  }))
})
type VocabularyFile = typeof VocabularyFile.Type

/** Shape of `sdp.config.yaml`. Every key is optional; see `defaults` for what an empty file means. */
export const ConfigFile = Schema.Struct({
  specs: Schema.optional(Globs),
  features: Schema.optional(Globs),
  code: Schema.optional(Globs),
  steps: Schema.optional(Globs),
  exclude: Schema.optional(Globs),
  evidence: Schema.optional(Schema.Struct({
    inputs: Schema.optional(Globs),
    env: Schema.optional(Schema.Array(Schema.String))
  })),
  results: Schema.optional(Schema.String),
  types: Schema.optional(Schema.String),
  ids: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  vocabulary: Schema.optional(VocabularyFile)
}).check(Schema.makeFilter((file) => configProblems(file)))
export type ConfigFile = typeof ConfigFile.Type

export interface Config {
  readonly specs: ReadonlyArray<string>
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
  /** Where `sdp types` writes the id declarations that type `annotate`, relative to the workspace root. */
  readonly types: string
  /** Id prefixes used by `sdp new` and to infer a kind, keyed by kind (a record without a prototype). */
  readonly ids: Readonly<Record<string, string>>
  /** The words sdp interprets ([[DEC-0002]]). */
  readonly vocabulary: Vocabulary
}

const sourceGlob = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py,go,java,kt,cs,rs,rb,scala,swift,php}"

/** Builds a record without a prototype, so a kind named `constructor` is just a key. */
const record = <V>(entries: Iterable<readonly [string, V]>): Readonly<Record<string, V>> => {
  const out: Record<string, V> = Object.create(null)
  for (const [key, value] of entries) out[key] = value
  return out
}

const defaultIds: ReadonlyArray<readonly [string, string]> = [
  ["requirement", "REQ"],
  ["nfr", "NFR"],
  ["decision", "DEC"],
  ["element", "ARCH"],
  ["pattern", "PAT"],
  ["milestone", "MS"],
  ["capability", "CAP"],
  ["risk", "RISK"]
]

export const defaults: Config = {
  specs: ["**/*.md"],
  features: ["**/*.feature"],
  code: [`src/${sourceGlob}`, `lib/${sourceGlob}`, `app/${sourceGlob}`, `packages/${sourceGlob}`],
  steps: ["**/*.steps.{ts,mts,js,mjs}"],
  exclude: ["**/node_modules/**", ".sdp/**", "**/dist/**", "**/build/**", ".git/**"],
  evidence: { inputs: [], env: [] },
  results: ".sdp/results.json",
  types: ".sdp/ids.d.ts",
  ids: record(defaultIds),
  vocabulary: defaultVocabulary
}

/** Each role the file names replaces its default; disciplines merge one by one. */
const resolveVocabulary = (file: VocabularyFile | undefined): Vocabulary => {
  const d = defaultVocabulary
  if (!file) return d
  return {
    kinds: { ...d.kinds, ...file.kinds },
    relations: { ...d.relations, ...file.relations },
    attributes: { ...d.attributes, ...file.attributes },
    qualities: file.qualities ?? d.qualities,
    statuses: { ...d.statuses, ...file.statuses },
    maturity: file.maturity ?? d.maturity,
    disciplines: new Map([...d.disciplines, ...Object.entries(file.disciplines ?? {})]),
    links: file.links ?? d.links,
    words: { ...d.words, ...file.words }
  }
}

export const resolveConfig = (file: ConfigFile | undefined): Config => {
  if (!file) return defaults
  return {
    specs: file.specs ?? defaults.specs,
    features: file.features ?? defaults.features,
    code: file.code ?? defaults.code,
    steps: file.steps ?? defaults.steps,
    exclude: [...defaults.exclude, ...(file.exclude ?? [])],
    evidence: {
      inputs: file.evidence?.inputs ?? defaults.evidence.inputs,
      env: file.evidence?.env ?? defaults.evidence.env
    },
    results: file.results ?? defaults.results,
    types: file.types ?? defaults.types,
    ids: record([...defaultIds, ...Object.entries(file.ids ?? {})]),
    vocabulary: resolveVocabulary(file.vocabulary)
  }
}

/**
 * What a configuration must satisfy beyond its shape, each problem at its path: a maturity ladder
 * of distinct levels that cannot be mistaken for a derived stage, and id prefixes that kind
 * inference reads back (letters only, one kind each).
 */
const configProblems = (file: ConfigFile): ReadonlyArray<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = []
  const vocabulary = file.vocabulary
  const ladder = vocabulary?.maturity
  if (ladder !== undefined) {
    if (ladder.length === 0) issues.push({ path: ["vocabulary", "maturity"], issue: "the maturity ladder needs at least one level" })
    const repeated = ladder.filter((level, index) => ladder.indexOf(level) !== index)
    if (repeated.length > 0) issues.push({ path: ["vocabulary", "maturity"], issue: `levels must be distinct: ${repeated.join(", ")} repeats` })
    const stages: ReadonlyArray<string> = Object.values(made.stages)
    const derived = ladder.filter((level) => stages.includes(level))
    if (derived.length > 0) {
      issues.push({
        path: ["vocabulary", "maturity"],
        issue: `${derived.join(", ")} is a stage sdp derives from scenario results, so it cannot be declared as a maturity`
      })
    }
  }
  const owners = new Map<string, string>()
  for (const [kind, prefix] of [...defaultIds, ...Object.entries(file.ids ?? {})]) {
    if (!/^[A-Za-z]+$/.test(prefix)) {
      issues.push({ path: ["ids", kind], issue: `prefix "${prefix}" must be letters only, so that the kind of an id like ${prefix}-x can be inferred` })
    }
    owners.set(kind, prefix.toLowerCase())
  }
  const byPrefix = new Map<string, Array<string>>()
  for (const [kind, prefix] of owners) byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), kind])
  for (const [prefix, kinds] of byPrefix) {
    if (kinds.length > 1) {
      issues.push({ path: ["ids"], issue: `${kinds.join(" and ")} share the prefix ${prefix.toUpperCase()}, so an id cannot say which kind it is` })
    }
  }
  return issues
}

export const configFileNames = ["sdp.config.yaml", "sdp.config.yml", "sdp.config.json"] as const
