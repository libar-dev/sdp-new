import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
const root = process.argv[2]
const muts = JSON.parse(readFileSync(process.argv[3], "utf8"))
for (const m of muts) {
  const path = `${root}/${m.file}`
  const orig = readFileSync(path, "utf8")
  const count = orig.split(m.from).length - 1
  if (count !== 1) { console.log(`## ${m.name}: SKIP (${count} matches)`); continue }
  writeFileSync(path, orig.replace(m.from, m.to))
  let out
  try { out = execFileSync(process.execPath, ["src/cli/main.ts", "run", "--concurrency", "8"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }
  catch (e) { out = (e.stdout ?? "") + (e.stderr ?? "") }
  finally { writeFileSync(path, orig) }
  const lines = out.split("\n")
  const summary = lines.filter((l) => /scenario\(s\):/.test(l)).join(" | ")
  const failed = lines.filter((l) => /^✘ failed/.test(l) && !/MS-(IOC|LCA|PR)#(construction-work|requirements-planned|what-elaboration|everything-planned)/.test(l)).map((l) => l.replace(/^✘ failed\s+/, "").split(" ")[0])
  console.log(`## ${m.name}: ${summary}`)
  if (failed.length) console.log("   caught by: " + failed.slice(0, 8).join(", ") + (failed.length > 8 ? ` …(+${failed.length - 8})` : ""))
}
