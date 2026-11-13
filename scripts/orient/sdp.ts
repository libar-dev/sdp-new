/**
 * The only place the orientation reads sdp. A surface is one command of sdp's command line, run once
 * per orientation however many recipes ask for it, and parsed as it prints. A section names the
 * commands it was derived from, so whoever reads it can ask sdp the same thing again.
 *
 * sdp runs from this repository's source unless SDP_MAIN names another entry point.
 */
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"

/** A record of `sdp graph`, as it prints it. */
export interface Node {
  readonly type: "node"
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly file: string | null
  readonly line: number | null
  readonly attrs: { readonly [key: string]: unknown }
}

export interface Edge {
  readonly type: "edge"
  readonly from: string
  readonly rel: string
  readonly to: string
  readonly declared?: ReadonlyArray<{ readonly file: string; readonly line: number }>
}

/** Each surface: the arguments that ask for it. */
export const surfaces = {
  vocabulary: ["vocabulary", "--json"],
  graph: ["graph"],
  lifecycle: ["lifecycle", "--json"]
} as const

export type Surface = keyof typeof surfaces

/** How a section cites a surface: the command a reader runs to see it whole. */
export const command = (surface: Surface): string => `sdp ${surfaces[surface].join(" ")}`

const main = process.env["SDP_MAIN"] ?? fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url))

export interface Asked {
  readonly value: unknown
  /** What sdp said makes its answer incomplete, or worth reading before relying on it. */
  readonly notes: ReadonlyArray<string>
}

const run = (args: ReadonlyArray<string>, root: string) =>
  new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    execFile(process.execPath, [main, ...args, "--root", root], { maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Exit 2 is sdp's "incomplete": the answer is printed, and stderr says what it could not read.
      const code = error === null ? 0 : typeof error.code === "number" ? error.code : 1
      if (code !== 0 && code !== 2) reject(new Error(`${command0(args)} exited ${code}: ${stderr.trim().split("\n")[0] ?? ""}`))
      else resolve({ stdout, stderr, code })
    })
  })

const command0 = (args: ReadonlyArray<string>) => `sdp ${args.join(" ")}`

/** Asks sdp for a surface. A `--json` answer is the envelope `{ complete, notes, data }`; `graph` is JSON lines. */
export const ask = async (surface: Surface, root: string): Promise<Asked> => {
  const { stdout, stderr, code } = await run(surfaces[surface], root)
  if (surface === "graph") {
    const records = stdout.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as Node | Edge)
    const notes = code === 2 ? stderr.split("\n").filter((line) => /^(incomplete|note):/.test(line)) : []
    return { value: records, notes }
  }
  const answer = JSON.parse(stdout) as { complete: boolean; notes: ReadonlyArray<string>; data: unknown }
  return { value: answer.data, notes: answer.complete ? answer.notes : ["incomplete", ...answer.notes] }
}
