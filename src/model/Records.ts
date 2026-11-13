/**
 * @sdp is ARCH-graph
 */
import { Schema } from "effect"

const Line = Schema.Number.check(
  Schema.isInt({ toJsonSchema: () => ({ type: "integer" }) }),
  Schema.isGreaterThanOrEqualTo(1)
)

export const SourceRef = Schema.Struct({
  file: Schema.String.annotate({ description: "Path of the file that declares the node or link, relative to the workspace root." }),
  line: Line.annotate({ description: "One-based line of the declaration." })
}).annotate({ identifier: "SourceRef", title: "Source reference", description: "Where a node or a link is declared." })
export type SourceRef = typeof SourceRef.Type

export const NodeRecord = Schema.Struct({
  type: Schema.Literal("node").annotate({ description: "Identifies a node record." }),
  id: Schema.String.annotate({ description: "The node's unique id in the workspace." }),
  kind: Schema.String.annotate({ description: "The kind of node, in the workspace's vocabulary." }),
  title: Schema.String.annotate({ description: "The name of the spec, rule, example or declaration." }),
  file: Schema.NullOr(Schema.String).annotate({ description: "Where the node is declared; null for a node nothing declares, the target of a dangling link." }),
  line: Schema.NullOr(Line).annotate({ description: "One-based line of the declaration; null for a node nothing declares." }),
  attrs: Schema.Record(Schema.String, Schema.Json).annotate({ description: "Every attribute the record keeps, written or derived, as JSON data." })
}).annotate({ identifier: "NodeRecord", title: "Node record", description: "One spec, rule, example, architectural node or anchored piece of code, as plain data." })
export type NodeRecord = typeof NodeRecord.Type

export const EdgeRecord = Schema.Struct({
  type: Schema.Literal("edge").annotate({ description: "Identifies an edge record." }),
  from: Schema.String.annotate({ description: "Id of the node the link starts from." }),
  rel: Schema.String.annotate({ description: "The relation of the link, in the workspace's vocabulary." }),
  to: Schema.String.annotate({ description: "Id of the node the link leads to." }),
  declared: Schema.Array(SourceRef).annotate({ description: "Every declaration that states the edge, in the order they were read." })
}).annotate({ identifier: "EdgeRecord", title: "Edge record", description: "One link between two nodes, with every declaration that states it." })
export type EdgeRecord = typeof EdgeRecord.Type

export const GraphRecord = Schema.Union([NodeRecord, EdgeRecord]).annotate({
  identifier: "GraphRecord", title: "Graph record", description: "One record of the state: a node or an edge, as sdp graph prints it on one JSON line."
})
export type GraphRecord = typeof GraphRecord.Type
