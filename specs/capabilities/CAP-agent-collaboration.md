---
id: CAP-agent-collaboration
kind: capability
title: Agent collaboration
iteration: I1
---

# Agent collaboration

AI agents read, query and change delivery state with the tools they already use, and get enough
context in one call to work on a specification safely.

Agents get four interchangeable interfaces, from least to most specialised. All four read the same
files, so they never disagree, and every fact they return carries the `file:line` it came from.

1. **Files and grep.** Ids are literal text: `grep -rn REQ-graph-query .` finds the spec, its
   mentions, code annotations and step results; `grep -rn "@sdp" src/` lists every code link
   ([[NFR-greppable]]).
2. **Line-oriented dumps.** `.sdp/graph.jsonl` and `.sdp/graph.tsv`, one fact per line, for jq and
   awk.
3. **The CLI.** `sdp q` ([[REQ-graph-query]]), `sdp show`, `sdp check`, `sdp run` and
   `sdp status` print JSON with `--json`; `sdp context` prints one Markdown document
   ([[REQ-cli]]).
4. **MCP.** `sdp mcp` serves the same reads as tools over stdio ([[REQ-mcp-server]]).

The entry point for implementation work is the context bundle: everything about one node in one
Markdown document ([[REQ-agent-context]]). Diagnostics carry a hint phrased as an instruction, so
an agent can fix what `sdp check` reports without reading the tool's code.
