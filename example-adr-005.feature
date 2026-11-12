@architect
@architect-adr:005
@architect-adr-status:accepted
@architect-adr-category:architecture
@architect-adr-supersedes:003
@architect-pattern:ADR005ElectronReactTechnologyStack
@architect-status:completed
@architect-product-area:Process
@architect-bounded-context:desktop
Feature: ADR-005 - Electron + React Technology Stack

  **Context:**
  Studio needs a desktop framework where every source file is trackable by
  architect annotation tags. The original choice (Tauri 2.x, ADR-003) used a
  Rust backend that is invisible to the annotation system — the delivery process
  that Studio demonstrates cannot track its own backend code. Studio is ~1% built,
  making the pivot cost near-zero.

  Additionally, the MCP server (PatternGraphAPI) is a Node.js module. With Tauri,
  it must run as a sidecar child process communicating via stdio JSON-RPC — adding
  process lifecycle management, crash recovery, and IPC bridge complexity. With
  Electron, it runs in the same Node.js main process via direct function calls.

  **Decision:**
  Pivot from Tauri 2.x to Electron + React 19. The entire Studio codebase becomes
  TypeScript/React — fully trackable by @architect-* annotations. PatternGraphAPI
  runs in Electron's main process (no sidecar needed), eliminating SidecarLifecycle
  as a separate concern and dramatically simplifying the IPC bridge.

  | Aspect | Tauri (ADR-003) | Electron (this ADR) |
  | Binary size | ~10 MB | ~150 MB |
  | Backend language | Rust (invisible to annotations) | TypeScript (fully trackable) |
  | MCP integration | Sidecar: spawn, monitor, stdio | In-process: direct function calls |
  | Process count | 3 (Rust + Node.js + Chromium) | 1 (Electron: Node.js + Chromium) |
  | Dogfooding | Partial (UI only) | Full (every file is a pattern) |

  **Consequences:**
  | Type | Impact |
  | Positive | Full dogfooding — every Studio component is a trackable pattern |
  | Positive | Architecture simplification — 1 process instead of 3 |
  | Positive | PatternGraphAPI runs in-process — no sidecar spawning or stdio transport |
  | Positive | Mature ecosystem — Electron tooling, debugging, and community support |
  | Negative | Larger binary size (~150 MB vs ~10 MB with Tauri) |
  | Negative | Higher memory usage (Chromium per-window overhead) |
  | Neutral | Higher memory usage is acceptable for a $49/month professional tool |

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | electron-main entry | pending | apps/desktop/src/main/index.ts | Yes | unit |
      | electron-preload | pending | apps/desktop/src/main/preload.ts | No | n/a |
      | vite-electron-config | pending | apps/desktop/vite.config.ts | No | n/a |
      | electron-builder config | pending | apps/desktop/electron-builder.yml | No | n/a |

  Rule: Decision: Studio uses Electron for full delivery-process dogfooding

    **Invariant:** Every Studio source file is written in TypeScript or Gherkin,
    both of which are trackable by the @architect-* annotation system.
    **Rationale:** A product that demonstrates delivery-process management must be
    buildable using its own delivery process. Tauri's Rust backend was invisible to
    annotations, creating a dogfooding gap. With Electron, the app shell, main process,
    preload scripts, and all UI components are trackable patterns.
    **Verified by:** Full annotation coverage, no invisible backend code.

    @acceptance-criteria @happy-path
    Scenario: Full annotation coverage
      Given Studio's codebase uses only TypeScript and Gherkin
      When architect_arch_coverage is run on the Studio repo
      Then every source directory is eligible for @architect annotations
      And no source files are in a language invisible to the extraction pipeline

    @acceptance-criteria @edge-case
    Scenario: No invisible backend code
      Given the Studio desktop app
      When the source tree is inspected
      Then there are no Rust, Go, or other non-TypeScript backend files
      And the Electron main process is TypeScript

  Rule: Decision: PatternGraphAPI runs in Electron main process

    **Invariant:** No separate sidecar process is needed for architecture queries.
    PatternGraphAPI is initialized in the Electron main process and called directly.
    **Rationale:** Electron's main process is Node.js — the same runtime as
    PatternGraphAPI. Direct function calls replace the stdio JSON-RPC transport,
    eliminating process spawning, crash recovery, and IPC serialization overhead.
    Query latency drops from ~50ms (sidecar round-trip) to <5ms (in-process call).
    **Verified by:** In-process query latency, no child process spawned.

    @acceptance-criteria @happy-path
    Scenario: In-process query latency
      Given the PatternGraphAPI is initialized in the Electron main process
      When a query is dispatched from the renderer via IPC
      Then the response time is under 5ms for cached queries
      And no child process is spawned for the query

    @acceptance-criteria @happy-path
    Scenario: Direct function call integration
      Given a connected project with a valid architect.config.ts
      When the main process calls buildPatternGraph() with the config
      Then a PatternGraphAPI instance is created in the same process
      And React components query it via typed Electron IPC handlers

  Rule: Decision: Electron IPC replaces Tauri command system

    **Invariant:** All renderer-to-main communication uses Electron's contextBridge
    and ipcMain/ipcRenderer — not Tauri's invoke/command system.
    **Rationale:** Electron IPC is well-documented, type-safe with TypeScript
    generics, and supports both request/response (invoke/handle) and event-based
    (send/on) patterns. The contextBridge security model exposes only whitelisted
    APIs to the renderer, following Electron security best practices.
    **Verified by:** Typed IPC contract, no direct Node.js access from renderer.

    @acceptance-criteria @happy-path
    Scenario: Typed IPC contract
      Given the preload script exposes architect API via contextBridge
      When a React component calls window.architect.query(tool, args)
      Then the call routes through ipcRenderer.invoke to the main process
      And the main process handler calls PatternGraphAPI and returns typed data

    @acceptance-criteria @edge-case
    Scenario: No direct Node.js access from renderer
      Given the renderer process
      When it attempts to access Node.js APIs directly
      Then access is denied by Electron's context isolation
      And all architecture queries must go through the exposed bridge API
