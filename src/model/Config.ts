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
  maturity: Schema.optional(Schema.Array(Schema.String)),
  ids: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  architecture: Schema.optional(Schema.Struct({
    kinds: Schema.optional(Schema.Array(Schema.String)),
    significanceGuideline: Schema.optional(Schema.Number),
    guidelineSeverity: Schema.optional(Schema.Literals(["info", "warning", "error"])),
    justifiedBy: Schema.optional(Schema.Array(Schema.String)),
    inventory: Schema.optional(Schema.Struct({
      include: Schema.optional(Globs),
      exclude: Schema.optional(Globs),
      pattern: Schema.optional(Schema.String)
    }))
  })),
  lifecycle: Schema.optional(Schema.Struct({
    disciplines: Schema.optional(Schema.Record(Schema.String, Schema.Array(Schema.String)))
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
  /** The authoring maturity ladder, lowest first. Gates are defined for the built-in levels. */
  readonly maturity: ReadonlyArray<string>
  /** Id prefixes used by `sdp new`, keyed by kind. */
  readonly ids: Readonly<Record<string, string>>
  readonly architecture: {
    /** Kinds that count as architectural abstractions (candidates for significance). */
    readonly kinds: ReadonlyArray<string>
    /**
     * Rough share of abstractions expected to be significant (a heuristic, not a limit).
     * Going above it only prompts a review of the curated set.
     */
    readonly significanceGuideline: number
    /** Severity of the hint when the guideline is exceeded; `info` unless a team wants it stricter. */
    readonly guidelineSeverity: "info" | "warning" | "error"
    /** Kinds whose links justify significance (decisions, quality requirements, ...). */
    readonly justifiedBy: ReadonlyArray<string>
    readonly inventory: {
      readonly include: ReadonlyArray<string>
      readonly exclude: ReadonlyArray<string>
      /** Regex (multiline) counting abstractions per file; defaults are per language. */
      readonly pattern: string | undefined
    }
  }
  /** RUP-style disciplines and the node kinds that represent work in each. */
  readonly disciplines: Readonly<Record<string, ReadonlyArray<string>>>
}

const sourceGlob = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py,go,java,kt,cs,rs,rb,scala,swift,php}"

export const defaults: Config = {
  specs: ["**/*.md"],
  features: ["**/*.feature"],
  code: [`src/${sourceGlob}`, `lib/${sourceGlob}`, `app/${sourceGlob}`, `packages/${sourceGlob}`],
  steps: ["**/*.steps.{ts,mts,js,mjs}"],
  exclude: ["**/node_modules/**", ".sdp/**", "**/dist/**", "**/build/**", ".git/**"],
  results: ".sdp/results.json",
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
    significanceGuideline: 0.1,
    guidelineSeverity: "info",
    justifiedBy: ["decision", "nfr"],
    inventory: {
      include: [`src/${sourceGlob}`, `lib/${sourceGlob}`, `app/${sourceGlob}`, `packages/${sourceGlob}`],
      exclude: ["**/*.test.*", "**/*.spec.*", "**/*.steps.*", "**/__tests__/**"],
      pattern: undefined
    }
  },
  disciplines: {
    "business-modeling": ["capability", "goal", "actor", "business-process", "vision", "stakeholder"],
    "requirements": ["requirement", "nfr", "feature", "story", "use-case", "epic"],
    "analysis-design": ["decision", "element", "pattern"],
    "implementation": ["code"],
    "test": ["scenario"],
    "deployment": ["release", "environment", "deployment"]
  }
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
    maturity: file.maturity ?? defaults.maturity,
    ids: { ...defaults.ids, ...file.ids },
    architecture: {
      kinds: arch?.kinds ?? defaults.architecture.kinds,
      significanceGuideline: arch?.significanceGuideline ?? defaults.architecture.significanceGuideline,
      guidelineSeverity: arch?.guidelineSeverity ?? defaults.architecture.guidelineSeverity,
      justifiedBy: arch?.justifiedBy ?? defaults.architecture.justifiedBy,
      inventory: {
        include: arch?.inventory?.include ?? file.code ?? defaults.architecture.inventory.include,
        exclude: arch?.inventory?.exclude ?? defaults.architecture.inventory.exclude,
        pattern: arch?.inventory?.pattern
      }
    },
    disciplines: { ...defaults.disciplines, ...file.lifecycle?.disciplines }
  }
}

export const configFileNames = ["sdp.config.yaml", "sdp.config.yml", "sdp.config.json"] as const
