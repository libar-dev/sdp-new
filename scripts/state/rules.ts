/**
 * The smallest program over sdp's state: the business-rule catalog, each rule by its feature and
 * its line with how far it has come, read from `sdp graph` with the schema of its records that the
 * package exports. `--schema` prints that schema as JSON Schema, for a program in any language.
 *
 *   node scripts/state/rules.ts            # feature, rule, stage: one rule per line
 *   node scripts/state/rules.ts --schema   # the JSON Schema of one line of sdp graph
 */
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { GraphRecord } from "sdp/effect"

if (process.argv.includes("--schema")) {
  console.log(JSON.stringify(Schema.toJsonSchemaDocument(GraphRecord), null, 2))
} else {
  const sdp = fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url))
  const decode = Schema.decodeUnknownSync(Schema.fromJsonString(GraphRecord))
  for (const line of execFileSync("node", [sdp, "graph"], { encoding: "utf8" }).trimEnd().split("\n")) {
    const record = decode(line) // a record off the contract fails here, not three calls later
    if (record.type === "node" && record.kind === "rule") { // the union narrows: attrs, file, line
      console.log([record.id.split("#")[0], record.title, record.attrs["stage"]].join("\t"))
    }
  }
}
