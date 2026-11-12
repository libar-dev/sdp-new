// A throwaway converter: one Markdown spec in, one Gherkin file out (plus one per embedded node).
// It does only what is mechanical, and keeps what it cannot place as `#` comments marked TODO, so
// nothing is lost and nothing changes meaning: scenario names, steps and order stay as they are.
//   node convert.mjs <file.md>...     writes <ID>.feature beside each file and removes the .md
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { parse } from "yaml"

const prefixes = { REQ: "requirement", NFR: "nfr", CAP: "capability", DEC: "decision", ARCH: "element", PAT: "pattern", MS: "milestone", RISK: "risk", PH: "phase" }
const inferKind = (id) => prefixes[/^([A-Za-z]+)[-_]/.exec(id)?.[1]?.toUpperCase()] ?? "spec"
const list = (value) => value == null ? [] : Array.isArray(value) ? value : typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [value]
const report = { files: 0, nodes: 0, comments: 0, questions: 0, resolved: 0, mentions: 0, droppedLinkAttrs: 0, untaggable: [], hazards: [] }

/** Tag lines for a node: identity and values, then links, then the plan. */
const tagLines = (id, data, where) => {
  const identity = [`@id=${id}`]
  if (data.kind && data.kind !== inferKind(id)) identity.push(`@kind=${data.kind}`)
  const links = [], plan = []
  const link = (rel, target, into) => {
    for (const t of list(target)) {
      if (t && typeof t === "object") { report.droppedLinkAttrs += Object.keys(t).length - 1; into.push(`@${rel}:${t.to}`) }
      else into.push(`@${rel}:${t}`)
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (["id", "kind", "title", "nodes"].includes(key)) continue
    if (key === "links") { if (Array.isArray(value)) for (const l of value) link(l.rel, l.to, links); else for (const [rel, to] of Object.entries(value ?? {})) link(rel, to, links) }
    else if (key === "iteration" || key === "phase") link(key, value, plan)
    else if (key === "activity") for (const [discipline, to] of Object.entries(value ?? {})) link(`activity.${discipline}`, to, plan)
    else if (key === "tags") identity.push(...list(value).map((t) => `@${String(t).replace(/^@/, "")}`))
    else for (const v of list(value)) {
      if (v !== null && typeof v !== "object" && !/\s/.test(String(v)) && String(v) !== "") identity.push(`@${key}=${v}`)
      else report.untaggable.push(`${where}: ${key}: ${JSON.stringify(v)}`)
    }
  }
  return [identity, links, plan].filter((line) => line.length > 0).map((line) => line.join(" "))
}

const unlink = (text) => text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, _id, shown) => { report.mentions++; return shown })
  .replace(/\[\[([^\]]+)\]\]/g, (_, id) => { report.mentions++; return id })
const keyword = /^(@|#|\||Feature:|Rule:|Background:|Scenario( Outline| Template)?:|Example:|Examples:|Scenarios:)/

const convert = (file) => {
  const lines = readFileSync(file, "utf8").replace(/\r\n?/g, "\n").split("\n")
  if (lines[0] !== "---") return
  const end = lines.indexOf("---", 1)
  const data = parse(lines.slice(1, end).join("\n")) ?? {}
  if (typeof data.id !== "string") return
  const body = lines.slice(end + 1)
  const title = data.title ?? body.find((l) => /^# /.test(l))?.slice(2).trim() ?? data.id
  const out = [...tagLines(data.id, data, file), `Feature: ${title}`]
  const tail = []
  let fence, gherkin = false, intro = true, questions = false, paragraph = []
  const flush = () => {
    if (paragraph.length === 0) return
    if (intro) {
      out.push("")
      for (const line of paragraph) {
        const text = unlink(line.trim())
        if (keyword.test(text)) report.hazards.push(`${file}: "${text.slice(0, 50)}"`)
        out.push(`  ${text}`)
      }
    } else { report.comments += paragraph.length; out.push("", ...paragraph.map((line) => `  # TODO(convert): ${unlink(line.trim())}`)) }
    paragraph = []
  }
  for (const line of body) {
    if (fence) {
      // CommonMark: a closing fence is indented at most three spaces and at least as long as the opening one.
      if (/^ {0,3}/.test(line) && !/^ {4}/.test(line) && line.trim().startsWith(fence) && /^([`~])\1*$/.test(line.trim())) { fence = undefined; continue }
      if (gherkin) out.push(line === "" ? "" : `  ${line}`)
      else { report.comments++; out.push(`  # TODO(convert): ${line}`) }
      continue
    }
    const open = /^(```+|~~~+)\s*(\w*)\s*$/.exec(line)
    if (open) { flush(); intro = false; fence = open[1]; gherkin = ["gherkin", "feature", "cucumber"].includes(open[2]); out.push(""); continue }
    const heading = /^(#+)\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      if (heading[1] === "#") continue
      intro = false
      questions = /^(open questions?|unresolved( questions)?|questions|tbd)\b/i.test(heading[2])
      if (!questions && !/^scenarios$/i.test(heading[2])) { report.comments++; out.push("", `  # TODO(convert): ${heading[1]} ${heading[2]}`) }
      continue
    }
    if (questions) {
      const item = /^\s*- (?:\[([ xX])\] )?(.*)$/.exec(line)
      if (item) tail.push({ resolved: item[1] !== undefined && item[1] !== " ", text: unlink(item[2]) })
      else if (line.trim() !== "" && tail.length > 0) tail.at(-1).text += ` ${unlink(line.trim())}`
      continue
    }
    if (line.trim() === "") flush()
    else paragraph.push(line)
  }
  flush()
  // A Rule holds every scenario after it, so the questions go last.
  for (const q of tail) {
    if (q.resolved) { report.resolved++; out.push("", `  # TODO(convert): resolved, make it a rule or delete it: ${q.text}`) }
    else { report.questions++; out.push("", "  @open", `  Rule: ${q.text}`) }
  }
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
  const directory = /^(README|AGENTS)\.md$/.test(file) ? "specs" : dirname(file)
  writeFileSync(join(directory, `${data.id}.feature`), text)
  for (const node of data.nodes ?? []) {
    report.nodes++
    writeFileSync(join(directory, `${node.id}.feature`), [...tagLines(node.id, node, `${file}#${node.id}`), `Feature: ${node.title ?? node.id}`, ""].join("\n"))
  }
  rmSync(file)
  report.files++
}
for (const file of process.argv.slice(2)) convert(file)
console.log(JSON.stringify(report, null, 1))
