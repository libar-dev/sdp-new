// A vitest reporter: writes what sdp records, one result per scenario and tier.
import { writeFileSync } from "node:fs"
export default class {
  onTestRunEnd(modules) {
    const results = []
    for (const m of modules) for (const t of m.children.allTests()) { const r = t.meta().sdp; if (r) results.push({ ...r, steps: r.steps.length, file: m.relativeModuleId }) }
    writeFileSync(new URL("./sdp-results.json", import.meta.url), JSON.stringify(results, null, 2))
  }
}
