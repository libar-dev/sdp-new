// Every example through the official Gherkin parser, unmodified: what it accepts, and what it holds.
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin"
import { IdGenerator } from "@cucumber/messages"
import { readFileSync } from "node:fs"
let bad = 0
for (const file of process.argv.slice(2)) {
  try {
    const doc = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(readFileSync(file, "utf8"))
    const f = doc.feature
    const rules = f.children.filter((c) => c.rule)
    const scenarios = f.children.flatMap((c) => c.scenario ? [c.scenario] : c.rule ? c.rule.children.flatMap((r) => r.scenario ? [r.scenario] : []) : [])
    console.log(`ok  ${file.split("/examples/")[1]}  tags ${f.tags.length}, rules ${rules.length}, scenarios ${scenarios.length}, comments ${doc.comments.length}`)
  } catch (e) { bad++; console.log(`ERR ${file}: ${(e.errors ?? [e]).map((x) => x.message).join("; ")}`) }
}
process.exit(bad ? 1 : 0)
