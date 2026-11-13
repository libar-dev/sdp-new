// The adapter, part 1: a Vite plugin that compiles a .feature file into a vitest test module.
// Feature -> describe, Rule -> describe, Scenario (each outline row) -> one test.
import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from "@cucumber/gherkin"
import { IdGenerator } from "@cucumber/messages"

const maturityOf = (tags) => tags.map((t) => t.name).find((n) => n.startsWith("@maturity="))
export default function sdp() {
  return {
    name: "sdp-vitest",
    transform(source, id) {
      if (!id.endsWith(".feature")) return
      const doc = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher()).parse(source)
      const feature = doc.feature
      const ruleOf = new Map() // scenario AST id -> its Rule
      for (const child of feature.children) for (const rc of child.rule?.children ?? []) if (rc.scenario) ruleOf.set(rc.scenario.id, child.rule)
      const byRule = new Map()
      for (const pickle of compile(doc, id, IdGenerator.uuid())) {
        const rule = ruleOf.get(pickle.astNodeIds[0])
        const toCome = Boolean(maturityOf(rule?.tags ?? []) ?? maturityOf(feature.tags))
        const tags = pickle.tags.map((t) => t.name).filter((n) => !/[=:]/.test(n)) // facts and links are not Cucumber tags
        const entry = { name: pickle.name, toCome, tags, steps: pickle.steps.map((s) => s.text) }
        byRule.set(rule?.name ?? "", [...(byRule.get(rule?.name ?? "") ?? []), entry])
      }
      return `import { describe, test } from "vitest"
import { runScenario } from ${JSON.stringify(new URL("./runtime.mjs", import.meta.url).pathname)}
describe(${JSON.stringify(feature.name)}, () => {
  for (const [rule, scenarios] of ${JSON.stringify([...byRule])})
    describe(rule, () => { for (const s of scenarios) test(s.name, (ctx) => runScenario(s, ctx)) })
})`
    }
  }
}
