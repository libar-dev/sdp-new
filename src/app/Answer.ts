/**
 * The envelope of every answer sdp gives: the data, whether it is complete,
 * and notes on what the reader should know before relying on it. An answer is
 * incomplete when something that could change it was not read — a spec that
 * does not parse, an annotation or a step registration that is computed — or
 * not followed — a traversal stopped by a limit. So "nothing found" is never
 * said of a graph that could not be fully read.
 *
 * Both transports hand it over the same way (REQ-cli, REQ-mcp-server): as
 * JSON, the envelope itself; as text, the data on its own and the notes apart.
 */
import { annotate } from "sdp/annotations"
import type { Project } from "../graph/Build.ts"
import type { Diagnostic, RuleId } from "../model/Diagnostic.ts"
import { formatSource } from "../model/Graph.ts"

annotate(import.meta, { is: "ARCH-reports" })

export interface Answer<A> {
  /** False when the data may miss something; the notes say what was not read or not followed. */
  readonly complete: boolean
  readonly notes: ReadonlyArray<string>
  readonly data: A
}

/** Rules that report part of the workspace as not read: what they name is not in the graph. */
const unreadRules: ReadonlySet<RuleId> = new Set(["front-matter", "gherkin-syntax", "missing-id", "duplicate-id", "annotation-unreadable"])

/** A diagnostic on one line: `file:line [rule] message`. */
export const problemLine = (diagnostic: Diagnostic): string =>
  `${formatSource(diagnostic.source) || "?"} [${diagnostic.rule}] ${diagnostic.message.replace(/\s*\n\s*/g, " ")}`

/** What of the workspace's specs and code could not be read into the graph. */
export const unread = (project: Project): ReadonlyArray<Diagnostic> => project.diagnostics.filter((diagnostic) => unreadRules.has(diagnostic.rule))

/**
 * An answer from a project's graph. It is complete unless the graph is not — something was not
 * read — or `missing` names more that this answer in particular did not read or follow. `notes`
 * are observations that leave it complete.
 */
export const answer = <A>(
  project: Project,
  data: A,
  about: { readonly missing?: ReadonlyArray<string>; readonly notes?: ReadonlyArray<string> } = {}
): Answer<A> => {
  const missing = [...unread(project).map((diagnostic) => `not read: ${problemLine(diagnostic)}`), ...(about.missing ?? [])]
  return { complete: missing.length === 0, notes: [...missing, ...(about.notes ?? [])], data }
}
