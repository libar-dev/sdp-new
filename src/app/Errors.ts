/**
 * What a use case fails with when the user's input or files are at fault. Each
 * error is a value the caller can inspect, and `describe` words any of them as
 * one line that names the input or the file — a user's mistake is never a
 * stack trace. Each of sdp's errors, here or in the module that fails with it,
 * carries that line as its CLI user message, which the command line prints on
 * stderr before it exits with 1.
 *
 * @sdp is ARCH-application
 */
import { Predicate, Schema } from "effect"
import * as CliError from "effect/cli/CliError"
import type { PlatformError } from "effect/PlatformError"
import type { QueryError } from "../graph/Query.ts"
import type { InvalidStepExpressions, UnawaitedFailures } from "../run/Runner.ts"
import type { ResultsLocked, ResultsUnreadable } from "../run/Store.ts"
import type { BaseNotFound } from "../workspace/Revisions.ts"
import type { ConfigError, SourcesChanged, StepLoadError, WorkspaceNotFound } from "../workspace/Workspace.ts"

/** An id no node has. */
export class UnknownNode extends Schema.TaggedError<UnknownNode>()("UnknownNode", {
  id: Schema.String,
  closest: Schema.optional(Schema.String)
}) {
  override get message() {
    return `no node ${this.id}${this.closest === undefined ? "" : `; closest: ${this.closest}`}`
  }
  override get [CliError.userMessage]() {
    return this.message
  }
}

/** Input a use case does not accept, with the reason and what would be accepted. */
export class Refused extends Schema.TaggedError<Refused>()("Refused", { reason: Schema.String }) {
  override get message() {
    return this.reason
  }
  override get [CliError.userMessage]() {
    return this.message
  }
}

/** A `--tags` filter that is not a Cucumber tag expression. */
export class InvalidTags extends Schema.TaggedError<InvalidTags>()("InvalidTags", {
  tags: Schema.String,
  problem: Schema.String
}) {
  override get message() {
    return `invalid --tags ${JSON.stringify(this.tags)}: ${this.problem}; write a tag expression such as "@checkout and not @slow"`
  }
  override get [CliError.userMessage]() {
    return this.message
  }
}

/** Targets that name no spec, scenario, file or directory — usually a typo that would select nothing. */
export class UnknownTargets extends Schema.TaggedError<UnknownTargets>()("UnknownTargets", {
  targets: Schema.Array(Schema.String)
}) {
  override get message() {
    return `nothing matches ${this.targets.join(", ")}: name a spec id, a scenario id, a file or a directory`
  }
  override get [CliError.userMessage]() {
    return this.message
  }
}

/**
 * Problems that leave part of the workspace not read as written — a spec, a code or step file, a
 * path that is no file — or a scenario outside a rule, so no run could be recorded truthfully.
 */
export class UnreadableSpecs extends Schema.TaggedError<UnreadableSpecs>()("UnreadableSpecs", {
  /** One line each: `file:line [rule] message`. */
  problems: Schema.Array(Schema.String)
}) {
  override get message() {
    return [
      `cannot run: ${this.problems.length} problem(s) in the workspace must be fixed first (sdp check)`,
      ...this.problems.map((problem) => `  ${problem}`)
    ].join("\n")
  }
  override get [CliError.userMessage]() {
    return this.message
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
  | ResultsUnreadable
  | UnawaitedFailures
  | UnknownTargets
  | UnreadableSpecs
  | QueryError
  | UnknownNode
  | Refused
  | BaseNotFound
  | PlatformError

/** The tag of every `AppError`: one that is missing here does not compile. */
const appErrorTags: { readonly [Tag in AppError["_tag"]]: true } = {
  ConfigError: true,
  WorkspaceNotFound: true,
  StepLoadError: true,
  SourcesChanged: true,
  InvalidStepExpressions: true,
  InvalidTags: true,
  ResultsLocked: true,
  ResultsUnreadable: true,
  UnawaitedFailures: true,
  UnknownTargets: true,
  UnreadableSpecs: true,
  QueryError: true,
  UnknownNode: true,
  Refused: true,
  BaseNotFound: true,
  PlatformError: true
}

/** Whether a failure is the user's input or files at fault, to be told in one line by `describe`. */
export const isAppError = (error: unknown): error is AppError =>
  Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag) && Object.hasOwn(appErrorTags, error._tag)

/**
 * Any of them as one line for the person or agent who caused it — a configuration, one line for each
 * of its problems: the CLI user message it carries, or the message of an Effect platform error, which carries none.
 */
export const describe = (error: AppError): string => CliError.getUserMessage(error) ?? error.message
