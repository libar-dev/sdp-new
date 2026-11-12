/**
 * The envelope of every answer sdp gives: the data, whether it is complete,
 * and notes on what the reader should know before relying on it. An answer is
 * incomplete when something that could change it was not read — a spec that
 * does not parse, a tag that says nothing as written, a code file that annotates
 * but does not parse, a step registration that is computed — or not followed —
 * a traversal stopped by a limit. So "nothing found" is never said of a graph
 * that could not be fully read.
 *
 * Both transports hand it over the same way (use-the-command-line, serve-agents): as
 * JSON, the envelope itself; as text, the data on its own and the notes apart.
 *
 * @sdp is ARCH-reports
 */
import type { Project } from "../graph/Build.ts"
import { type Diagnostic, problemLine, unreadRules } from "../model/Diagnostic.ts"

export interface Answer<A> {
  /** False when the data may miss something; the notes say what was not read or not followed. */
  readonly complete: boolean
  readonly notes: ReadonlyArray<string>
  readonly data: A
}

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
