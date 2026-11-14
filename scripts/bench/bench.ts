#!/usr/bin/env node
/**
 * How long sdp takes on a large workspace on disk: the median of warm runs of `sdp q`, `sdp status`
 * and `sdp check`, each a fresh process as a person or an agent starts it, beside `sdp --version`,
 * which loads sdp and reads no workspace.
 *
 *   node scripts/bench/bench.ts                                  5,000 specs and 20,000 source files
 *   node scripts/bench/bench.ts --specs 1000 --files 4000 --runs 7
 *   node scripts/bench/bench.ts --dir /tmp/big --reuse           measure a workspace generated before
 *   node scripts/bench/bench.ts --json                           one JSON object, for a script
 *
 * The workspace is generate.ts's, written to --dir (by default a folder of the system's temporary
 * directory named by its size) and left there for --reuse. Each command runs once to warm the file
 * system's and Node's caches, then --runs times. sdp runs from this repository's source unless
 * SDP_MAIN names another entry point, such as the JavaScript a package ships.
 */
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { generateWorkspace, layout } from "./generate.ts"

const { values } = parseArgs({
  options: {
    specs: { type: "string", default: "5000" },
    files: { type: "string", default: "20000" },
    runs: { type: "string", default: "5" },
    dir: { type: "string" },
    reuse: { type: "boolean", default: false },
    json: { type: "boolean", default: false }
  }
})

const size = { specs: Number(values.specs), files: Number(values.files) }
const runs = Number(values.runs)
const directory = resolve(values.dir ?? join(tmpdir(), `sdp-bench-${size.specs}-${size.files}`))
const main = process.env["SDP_MAIN"] ?? fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url))

/** The commands measured, as a shell would split them. */
const commands: ReadonlyArray<ReadonlyArray<string>> = [
  ["--version"],
  ["q", "feature[maturity=ready] -realized-by-> element <-is- code", "--ids"],
  ["status"],
  ["check"]
]

const once = (args: ReadonlyArray<string>) =>
  new Promise<{ readonly ms: number; readonly code: number }>((done, reject) => {
    const started = performance.now()
    execFile(process.execPath, [main, ...args], { cwd: directory, maxBuffer: 256 * 1024 * 1024 }, (error) => {
      const ms = performance.now() - started
      if (error !== null && typeof error.code !== "number") reject(error)
      else done({ ms, code: error === null ? 0 : Number(error.code) })
    })
  })

const median = (samples: ReadonlyArray<number>) => {
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const generated = values.reuse && existsSync(join(directory, "sdp.config.yaml"))
  ? undefined
  : await (async () => {
    const started = performance.now()
    await rm(directory, { recursive: true, force: true })
    const written = await generateWorkspace(directory, size)
    return { ...written, ms: Math.round(performance.now() - started) }
  })()

const measured: Array<{ readonly command: string; readonly median: number; readonly min: number; readonly max: number; readonly exit: number }> = []
for (const args of commands) {
  await once(args)
  const samples: Array<number> = []
  let exit = 0
  for (let i = 0; i < runs; i++) {
    const { code, ms } = await once(args)
    samples.push(ms)
    exit = code
  }
  const command = `sdp ${args.map((arg) => /[\s[\]<>]/.test(arg) ? `'${arg}'` : arg).join(" ")}`
  measured.push({ command, median: Math.round(median(samples)), min: Math.round(Math.min(...samples)), max: Math.round(Math.max(...samples)), exit })
}

const report = {
  directory,
  size,
  layout: layout(size),
  generatedMs: generated?.ms ?? null,
  runs,
  node: process.version,
  compileCache: process.env["NODE_COMPILE_CACHE"] !== undefined,
  sdp: main,
  measured
}

if (values.json) {
  console.log(JSON.stringify(report))
} else {
  const { annotated, decisions, features, files } = report.layout
  console.log(`workspace  ${directory}`)
  console.log(`           ${features} features, ${decisions} decisions, ${files} source files (${annotated} annotated)${generated ? `, generated in ${(generated.ms / 1000).toFixed(1)} s` : ", reused"}`)
  console.log(`node       ${process.version}${report.compileCache ? ", NODE_COMPILE_CACHE set" : ""}; median of ${runs} warm runs`)
  const width = Math.max(...measured.map((row) => row.command.length))
  console.log(`\n${"command".padEnd(width)}  median    min      max      exit`)
  for (const row of measured) {
    const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`.padEnd(8)
    console.log(`${row.command.padEnd(width)}  ${seconds(row.median)}  ${seconds(row.min)} ${seconds(row.max)} ${row.exit}`)
  }
}
