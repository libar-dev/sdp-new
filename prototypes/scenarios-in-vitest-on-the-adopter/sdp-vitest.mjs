// A Vite plugin: each .feature file becomes a vitest test module. Feature and Rule -> describe, Scenario -> test.
import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from "@cucumber/gherkin"
import { IdGenerator } from "@cucumber/messages"
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const fact = (tags, key) => tags.map((t) => t.name).find((n) => n.startsWith(`@${key}=`))?.slice(key.length + 2)
export default function sdp() {
  return {
    name: "sdp-vitest",
    transform(source, id) {
      if (!id.endsWith(".feature")) return
      const doc = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher()).parse(source)
      const feature = doc.feature, specId = fact(feature.tags, "id")
      const ruleOf = new Map()
      for (const child of feature.children) for (const rc of child.rule?.children ?? []) if (rc.scenario) ruleOf.set(rc.scenario.id, child.rule)
      const byRule = new Map()
      for (const pickle of compile(doc, id, IdGenerator.uuid())) {
        const rule = ruleOf.get(pickle.astNodeIds[0])
        const toCome = Boolean(fact(rule?.tags ?? [], "maturity") ?? fact(feature.tags, "maturity"))
        const tags = pickle.tags.map((t) => t.name).filter((n) => !/[=:]/.test(n)) // facts and links are not Cucumber tags
        const entry = { id: `${specId}#${slug(pickle.name)}`, name: pickle.name, toCome, tags, steps: pickle.steps.map((s) => s.text) }
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
