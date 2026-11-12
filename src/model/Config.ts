import { Schema } from "effect"

const Globs = Schema.Array(Schema.String)

/** Shape of `sdp.config.yaml`. Every key is optional; see `defaults` for what an empty file means. */
export const ConfigFile = Schema.Struct({
  specs: Schema.optional(Globs),
  features: Schema.optional(Globs),
  code: Schema.optional(Globs),
  steps: Schema.optional(Globs),
  exclude: Schema.optional(Globs),
  results: Schema.optional(Schema.String),
  types: Schema.optional(Schema.String),
  maturity: Schema.optional(Schema.Array(Schema.String)),
  ids: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  architecture: Schema.optional(Schema.Struct({
    kinds: Schema.optional(Schema.Array(Schema.String)),
    drivers: Schema.optional(Schema.Array(Schema.String))
  })),
  lifecycle: Schema.optional(Schema.Struct({
    disciplines: Schema.optional(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    planRelations: Schema.optional(Schema.Array(Schema.String)),
    phaseRelations: Schema.optional(Schema.Array(Schema.String))
  }))
})
export type ConfigFile = typeof ConfigFile.Type

export interface Config {
  readonly specs: ReadonlyArray<string>
  readonly features: ReadonlyArray<string>
  readonly code: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
  /** Where `sdp run` stores scenario results, relative to the workspace root. */
  readonly results: string
  /** Where `sdp types` writes the id declarations that type `annotate`, relative to the workspace root. */
  readonly types: string
  /** The authoring maturity ladder, lowest first. Gates are defined for the built-in levels. */
  readonly maturity: ReadonlyArray<string>
  /** Id prefixes used by `sdp new`, keyed by kind. */
  readonly ids: Readonly<Record<string, string>>
  readonly architecture: {
    /** Kinds that are architectural abstractions an architect may mark significant. */
    readonly kinds: ReadonlyArray<string>
    /** Kinds of architectural drivers (decisions, quality requirements) shown with significant nodes. */
    readonly drivers: ReadonlyArray<string>
  }
  /** RUP-style disciplines and the node kinds whose planned nodes are, by default, work in each. */
  readonly disciplines: Readonly<Record<string, ReadonlyArray<string>>>
  /** Relations from a node to the iteration it is planned into (`iteration: E1`); mentions never plan. */
  readonly planRelations: ReadonlyArray<string>
  /** Relations from an iteration or a milestone to its phase (`phase: elaboration`). */
  readonly phaseRelations: ReadonlyArray<string>
}

const sourceGlob = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py,go,java,kt,cs,rs,rb,scala,swift,php}"

export const defaults: Config = {
  specs: ["**/*.md"],
  features: ["**/*.feature"],
  code: [`src/${sourceGlob}`, `lib/${sourceGlob}`, `app/${sourceGlob}`, `packages/${sourceGlob}`],
  steps: ["**/*.steps.{ts,mts,js,mjs}"],
  exclude: ["**/node_modules/**", ".sdp/**", "**/dist/**", "**/build/**", ".git/**"],
  results: ".sdp/results.json",
  types: ".sdp/ids.d.ts",
  maturity: ["idea", "draft", "specified", "ready"],
  ids: {
    requirement: "REQ",
    nfr: "NFR",
    decision: "DEC",
    element: "ARCH",
    pattern: "PAT",
    milestone: "MS",
    capability: "CAP",
    risk: "RISK"
  },
  architecture: {
    kinds: ["element", "pattern"],
    drivers: ["decision", "nfr"]
  },
  disciplines: {
    "business-modeling": ["capability", "goal", "actor", "business-process", "vision", "stakeholder"],
    "requirements": ["requirement", "nfr", "feature", "story", "use-case", "epic"],
    "analysis-design": ["decision", "element", "pattern"],
    // No kind is implementation or test work by itself: a spec plans them with `activity:`.
    "implementation": [],
    "test": [],
    "deployment": ["release", "environment", "deployment"]
  },
  planRelations: ["iteration"],
  phaseRelations: ["phase"]
}

export const resolveConfig = (file: ConfigFile | undefined): Config => {
  if (!file) return defaults
  const arch = file.architecture
  return {
    specs: file.specs ?? defaults.specs,
    features: file.features ?? defaults.features,
    code: file.code ?? defaults.code,
    steps: file.steps ?? defaults.steps,
    exclude: [...defaults.exclude, ...(file.exclude ?? [])],
    results: file.results ?? defaults.results,
    types: file.types ?? defaults.types,
    maturity: file.maturity ?? defaults.maturity,
    ids: { ...defaults.ids, ...file.ids },
    architecture: {
      kinds: arch?.kinds ?? defaults.architecture.kinds,
      drivers: arch?.drivers ?? defaults.architecture.drivers
    },
    disciplines: { ...defaults.disciplines, ...file.lifecycle?.disciplines },
    planRelations: file.lifecycle?.planRelations ?? defaults.planRelations,
    phaseRelations: file.lifecycle?.phaseRelations ?? defaults.phaseRelations
  }
}

export const configFileNames = ["sdp.config.yaml", "sdp.config.yml", "sdp.config.json"] as const
