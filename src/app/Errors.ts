/**
 * What a use case fails with when the user's input or files are at fault. Each
 * error is a value the caller can inspect, and `describe` words any of them as
 * one line that names the input or the file — a user's mistake is never a
 * stack trace.
 */
import { annotate } from "sdp/annotations"
import { Schema } from "effect"
import type { PlatformError } from "effect/PlatformError"
import type { QueryError } from "../graph/Query.ts"
import type { InvalidStepExpressions } from "../run/Runner.ts"
import type { ResultsLocked } from "../run/Store.ts"
import type { ConfigError, SourcesChanged, StepLoadError, WorkspaceNotFound } from "../workspace/Workspace.ts"

annotate(import.meta, { is: "ARCH-reports" })

/** An id no node has. */
export class UnknownNode extends Schema.TaggedError<UnknownNode>()("UnknownNode", {
  id: Schema.String,
  closest: Schema.optional(Schema.String)
}) {
  override get message() {
    return `no node ${this.id}${this.closest === undefined ? "" : `; closest: ${this.closest}`}`
  }
}

/** Input a use case does not accept, with the reason and what would be accepted. */
export class Refused extends Schema.TaggedError<Refused>()("Refused", { reason: Schema.String }) {
  override get message() {
    return this.reason
  }
}

/** A `--tags` filter that is not a Cucumber tag expression. */
export class InvalidTags extends Schema.TaggedError<InvalidTags>()("InvalidTags", {
  tags: Schema.String,
  problem: Schema.String
}) {
  override get message() {
    return `invalid --tags ${JSON.stringify(this.tags)}: ${this.problem}; write a tag expression such as "@nfr and not @slow"`
  }
}

/** Targets that name no spec, scenario, file or directory — usually a typo that would select nothing. */
export class UnknownTargets extends Schema.TaggedError<UnknownTargets>()("UnknownTargets", {
  targets: Schema.Array(Schema.String)
}) {
  override get message() {
    return `nothing matches ${this.targets.join(", ")}: name a spec id, a scenario id, a file or a directory`
  }
}

/** Problems that leave scenarios unread or their ids ambiguous, so no run could be complete or recorded truthfully. */
export class UnreadableSpecs extends Schema.TaggedError<UnreadableSpecs>()("UnreadableSpecs", {
  /** One line each: `file:line [rule] message`. */
  problems: Schema.Array(Schema.String)
}) {
  override get message() {
    return [
      `cannot run: ${this.problems.length} problem(s) leave scenarios unread or their ids ambiguous; fix them first (sdp check)`,
      ...this.problems.map((problem) => `  ${problem}`)
    ].join("\n")
  }
}

export type AppError =
  | ConfigError
  | WorkspaceNotFound
  | StepLoadError
  | SourcesChanged
  | InvalidStepExpressions
  | InvalidTags
  | ResultsLocked
  | UnknownTargets
  | UnreadableSpecs
  | QueryError
  | UnknownNode
  | Refused
  | PlatformError

/** Any of them as one line for the person or agent who caused it. */
export const describe = (error: AppError): string => {
  switch (error._tag) {
    case "ConfigError":
      return `${error.file}: invalid configuration: ${error.message.replace(/\s*\n\s*/g, " ")}`
    case "StepLoadError":
      return `${error.file}: could not load step definitions: ${error.message}`
    case "QueryError":
      return `query error: ${error.message}`
    default:
      return error.message
  }
}
