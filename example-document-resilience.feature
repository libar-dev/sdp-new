@architect
@architect-pattern:DocumentResilience
@architect-status:roadmap
@architect-phase:2
@architect-product-area:Desktop
@architect-effort:3d
@architect-priority:high
@architect-depends-on:DocumentationView,LiveDocumentationApi,BlockRenderer
@architect-see-also:ElectronMcpIntegration
@architect-business-value:graceful-degradation-ensuring-enterprise-demos-survive-rebuild-errors-and-disconnection
@architect-bounded-context:desktop
@architect-layer:application
@architect-release:vNEXT
Feature: DocumentResilience - Loading, Error, and Recovery States for Live Documentation

  **Problem:**
  The `DocumentationView` renders documents when everything works. But the live
  documentation pipeline has several transient states that require explicit UI
  handling: initial codec decode (50-200ms), PatternGraph rebuild after file
  changes, codec failures, unknown document types, and connection drops.

  Without resilience handling:
  - Users see a blank panel during the initial decode (no loading feedback)
  - File saves cause content to flash (skeleton replaces valid content during rebuild)
  - A single codec failure crashes the entire document area
  - A single malformed block crashes the entire document (no block-level isolation)
  - Connection drops show a frozen view with no recovery path
  - Enterprise demos fail catastrophically on any transient error

  **Solution:**
  A layered resilience system matching the 3 states in wireframe 12:

  1. **Skeleton Loading** (STATE 1) — animated placeholder during initial fetch.
     Used only for the first load; subsequent fetches keep existing content visible.
  2. **Stale Cache Overlay** (STATE 2) — dimmed content with amber warning banner
     during rebuild. Content remains readable and scrollable. Removed atomically
     when fresh data arrives.
  3. **Error Boundary** (STATE 3) — document-level and block-level error panels.
     Document errors show retry. Block errors are contained — surrounding blocks
     render normally. Disconnection preserves content with a recovery banner.

  ```
  State Machine:

  initial ──→ loading ──→ content ──→ stale ──→ content (fresh)
                │                       │
                ▼                       ▼
              error                   error (preserves stale content)
                │
                ▼
            disconnected (preserves last content + recovery banner)
  ```

  # ===========================================================================
  # DELIVERABLES
  # ===========================================================================

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | DocumentSkeleton component | pending | apps/desktop/src/components/docs/DocumentSkeleton.tsx | Yes | unit |
      | StaleOverlay component | pending | apps/desktop/src/components/docs/StaleOverlay.tsx | Yes | unit |
      | DocumentErrorPanel component | pending | apps/desktop/src/components/docs/DocumentErrorPanel.tsx | Yes | unit |
      | DisconnectionBanner component | pending | apps/desktop/src/components/docs/DisconnectionBanner.tsx | Yes | unit |
      | BlockErrorBoundary extension | pending | apps/desktop/src/components/blocks/BlockErrorBoundary.tsx | Yes | unit |
      | useDocumentRefreshState hook | pending | apps/desktop/src/lib/use-document-refresh-state.ts | Yes | unit |

  # ===========================================================================
  # RULE 1: Loading Skeleton Matches Document Layout Structure
  # ===========================================================================

  Rule: Loading skeleton matches document layout structure

    **Invariant:** The `DocumentSkeleton` component renders animated placeholder
    bars mimicking the visual structure of a document: a wide bar for the heading,
    narrower bars for paragraph text, a grid of bars for a table placeholder, and
    a thin line for a separator. The skeleton uses CSS `@keyframes` pulse animation.
    The skeleton is shown only during the initial document fetch (when no prior
    content exists). The `DocTypeList` remains fully interactive during skeleton
    loading — the user can switch types without waiting.

    **Rationale:** Skeleton loading (wireframe 12, STATE 1) provides spatial
    orientation — the user can see where content will appear before it arrives.
    This is superior to a centered spinner, which provides no layout context.
    Keeping the type list interactive during loading prevents the perception of
    the entire view being frozen. Limiting skeletons to initial load prevents
    content flash on rebuild (handled by the stale overlay instead).

    **Verified by:** Skeleton shown during initial document load,
    Type list interactive during skeleton,
    Content replaces skeleton atomically

    @acceptance-criteria @happy-path
    Scenario: Skeleton shown during initial document load
      Given the user selects "business-rules" for the first time
      When useArchitectDoc is in loading state with no prior data
      Then DocumentSkeleton renders in the content area
      And the skeleton shows animated bars mimicking heading, paragraph, and table layout
      And the DocumentMetadataHeader shows a loading indicator

    @acceptance-criteria @happy-path
    Scenario: Type list stays interactive during skeleton loading
      Given the DocumentSkeleton is visible while a document loads
      When the user clicks a different type in the DocTypeList
      Then the previous load is cancelled
      And a new skeleton appears for the newly selected type
      And the DocTypeList highlights the new selection immediately

    @acceptance-criteria @happy-path
    Scenario: Content replaces skeleton atomically
      Given the DocumentSkeleton is visible
      When useArchitectDoc transitions from loading to data-available
      Then the skeleton is replaced by the DocumentRenderer in a single frame
      And no intermediate blank state is visible
      And the DocumentMetadataHeader updates with freshness and decode time

  # ===========================================================================
  # RULE 2: Auto-Refresh on Source File Change Preserves Scroll
  # ===========================================================================

  Rule: Auto-refresh on source file change preserves scroll position

    **Invariant:** When `rebuildGeneration` increments (source file changed,
    PatternGraph rebuilt), `useArchitectDoc` auto-refetches the current document.
    The existing content remains visible during the re-fetch — no skeleton is
    shown. The `DocumentMetadataHeader` freshness indicator transitions to
    `Stale · Rebuilding...` (orange). When fresh data arrives, the content
    updates atomically and scroll position is preserved. If the re-fetch fails,
    the stale content remains with an error banner.

    **Rationale:** Auto-refresh is the core live documentation value proposition
    — edit a `.feature` file, save, see the document update. Showing a skeleton
    during rebuild would break flow (content disappears and reappears). Scroll
    preservation prevents disorientation — the user should see the same section
    they were reading, updated with fresh data. The stale content fallback ensures
    the user always has something to read, even if the rebuild produces an error.

    **Verified by:** Rebuild triggers auto-refetch with stale indicator,
    Existing content stays visible during rebuild,
    Stale indicator shown in metadata header,
    Scroll position preserved after refresh

    @acceptance-criteria @happy-path
    Scenario: Rebuild triggers auto-refetch with stale indicator
      Given the user is viewing the business-rules document
      When rebuildGeneration increments from 6 to 7
      Then useArchitectDoc fires a new fetch for "business-rules"
      And the DocumentMetadataHeader shows "Stale · Rebuilding..." in orange
      And the existing document content remains visible

    @acceptance-criteria @happy-path
    Scenario: Existing content stays visible during rebuild
      Given a rebuild is in progress and the document shows stale content
      When the user scrolls through the document
      Then the content is fully readable and interactive
      And collapsible blocks can still be expanded and collapsed
      And the document outline still provides section navigation

    @acceptance-criteria @happy-path
    Scenario: Fresh data replaces stale content atomically
      Given the rebuild completes and useArchitectDoc returns fresh data
      When the document content updates
      Then the stale indicator transitions to "Fresh · Nms" in green
      And the document sections update with new content
      And no skeleton or blank state is shown during the transition

    @acceptance-criteria @edge-case
    Scenario: Scroll position preserved after content refresh
      Given the user has scrolled to "Phase 3 — Codecs" section
      When a rebuild completes and fresh content replaces the stale document
      Then the viewport remains scrolled to the Phase 3 section
      And the document outline highlights the same section

  # ===========================================================================
  # RULE 3: Stale Cache Overlay During Re-Decode
  # ===========================================================================

  Rule: Stale cache overlay during re-decode

    **Invariant:** When a document is being re-decoded after a PatternGraph rebuild,
    the `StaleOverlay` component renders a semi-transparent dimmed layer over the
    existing content with an amber warning banner: "Source files changed. Re-decoding
    document from fresh PatternGraph (gen #N)...". The underlying content remains
    readable and scrollable through the overlay. The overlay is removed atomically
    when fresh decoded data arrives.

    **Rationale:** The stale overlay (wireframe 12, STATE 2) communicates that the
    content is outdated without hiding it. Dimming provides visual differentiation
    from fresh content. The generation number in the banner helps developers
    correlate rebuilds with file changes during debugging. Scrollability ensures
    the user can continue reading while waiting for the re-decode. This is preferable
    to a spinner or skeleton, which would hide potentially useful content.

    **Verified by:** Dimmed overlay with warning banner during re-decode,
    Content readable and scrollable through overlay,
    Overlay removed on fresh data arrival

    @acceptance-criteria @happy-path
    Scenario: Dimmed overlay with warning banner during re-decode
      Given a document is displayed and a rebuild starts
      When the useDocumentRefreshState transitions to "stale"
      Then a semi-transparent overlay dims the document content
      And an amber banner shows "Source files changed. Re-decoding document from fresh PatternGraph (gen #7)..."
      And the generation number in the banner matches the current rebuildGeneration

    @acceptance-criteria @happy-path
    Scenario: Content readable and scrollable through overlay
      Given the StaleOverlay is visible over the document
      When the user scrolls the document area
      Then the content scrolls normally beneath the overlay
      And text remains legible through the semi-transparent dimming
      And the warning banner stays fixed at the top of the content area

    @acceptance-criteria @happy-path
    Scenario: Overlay removed on fresh data arrival
      Given the StaleOverlay is visible during a re-decode
      When useArchitectDoc returns fresh data
      Then the overlay is removed in a single frame
      And the freshness indicator updates to green "Fresh"
      And the document content is no longer dimmed

  # ===========================================================================
  # RULE 4: Document-Level Error Boundary with Retry
  # ===========================================================================

  Rule: Document-level error boundary with retry

    **Invariant:** When `useArchitectDoc` or `useArchitectDocDetail` returns an error,
    `DocumentErrorPanel` renders a red-bordered panel with the error message, the
    document type that failed, and a "Retry" button. The `DocTypeList` remains
    fully interactive — the user can select a different type. If a re-fetch fails
    after previously successful content, the stale content is preserved with an
    error banner overlay ("last known good" pattern). An unknown document type
    error includes a list of available types from `architect_doc_types`.

    **Rationale:** Error isolation between the document area and the type list
    prevents a single codec failure from locking the user out of all documentation.
    The retry button provides a one-click recovery path. Preserving stale content
    on re-fetch failure (rather than replacing it with an error panel) ensures the
    user doesn't lose access to content they were reading — the content is outdated
    but still useful. Listing available types on unknown-type errors provides
    immediate actionable guidance.

    **Verified by:** Decode error shows panel with retry,
    Type list unaffected by document error,
    Stale content preserved on re-fetch failure,
    Unknown type error lists available types

    @acceptance-criteria @happy-path
    Scenario: Decode error shows error panel with retry button
      Given the user selects a document type
      When useArchitectDoc returns an error "Codec decode failed: invalid schema"
      Then a DocumentErrorPanel renders with red border
      And the panel shows the error message and the failed document type
      And a "Retry" button is visible
      When the user clicks "Retry"
      Then useArchitectDoc re-fetches the document

    @acceptance-criteria @happy-path
    Scenario: Type list remains interactive during document error
      Given a DocumentErrorPanel is shown for "design-review" failure
      When the user clicks "business-rules" in the DocTypeList
      Then the error panel is replaced by a loading skeleton
      And the business-rules document loads normally
      And the error state is cleared

    @acceptance-criteria @edge-case
    Scenario: Stale content preserved on re-fetch failure
      Given the user is viewing a successfully loaded document
      When a rebuild occurs and the re-fetch fails with an error
      Then the previously loaded content remains visible
      And an error banner shows above the stale content: "Refresh failed. Showing last known content."
      And the "Retry" button is available in the banner

    @acceptance-criteria @validation
    Scenario: Unknown type error lists available types
      Given the user navigates to /docs?type=nonexistent-type
      When useArchitectDoc returns error "Unknown document type"
      Then the DocumentErrorPanel lists all available document types
      And each listed type is clickable and navigates to that document
      And the DocTypeList highlights no selection

  # ===========================================================================
  # RULE 5: Block-Level Error Boundary Contains Failures
  # ===========================================================================

  Rule: Block-level error boundary contains failures to individual blocks

    **Invariant:** Each block rendered by `BlockRenderer` is wrapped in a
    `BlockErrorBoundary`. When a block component throws during render, the
    error boundary catches it and displays an inline error placeholder with a
    yellow border showing the block type and error message. Surrounding blocks
    in the same document render normally. A "Show Raw" toggle reveals the raw
    JSON data for the failed block, enabling debugging. The document remains
    scrollable and interactive despite individual block failures.

    **Rationale:** Block-level isolation prevents a single malformed block
    (e.g., invalid Mermaid syntax that crashes mermaid.js, or a table with
    mismatched column counts) from taking down the entire document. The yellow
    border matches the existing BlockRenderer unknown-type warning style,
    creating visual consistency for "something unexpected happened" states.
    The "Show Raw" toggle provides developer-facing diagnostics without
    cluttering the normal view.

    **Verified by:** Single block failure contained in boundary,
    Surrounding blocks render normally,
    Show Raw toggle reveals block JSON,
    Document scrollable despite block error

    @acceptance-criteria @happy-path
    Scenario: Single block failure contained in error boundary
      Given a document with 5 blocks where the 3rd block (mermaid) throws during render
      When BlockRenderer processes all 5 blocks
      Then blocks 1, 2, 4, and 5 render normally
      And the 3rd block renders a yellow-bordered error placeholder
      And the placeholder shows "mermaid block failed: [error message]"

    @acceptance-criteria @happy-path
    Scenario: Surrounding blocks render normally around error
      Given a block error boundary has caught an error for a single block
      When the user examines the document
      Then all other blocks are fully interactive
      And collapsible blocks can expand and collapse
      And table blocks can scroll horizontally
      And the document structure is intact

    @acceptance-criteria @happy-path
    Scenario: Show Raw toggle reveals block JSON for debugging
      Given a block error placeholder is visible
      When the user clicks "Show Raw"
      Then the raw JSON data for the failed block is displayed
      And the JSON is syntax-highlighted in a code block
      And clicking "Show Raw" again hides the JSON

    @acceptance-criteria @edge-case
    Scenario: Document remains scrollable despite multiple block errors
      Given a document where 3 out of 10 blocks fail to render
      When the user scrolls through the document
      Then the document scrolls normally
      And 7 blocks render with content
      And 3 blocks show error placeholders at their positions
      And the document outline still navigates to working sections

  # ===========================================================================
  # RULE 6: Disconnection Recovery with Content Preservation
  # ===========================================================================

  Rule: Disconnection recovery with content preservation

    **Invariant:** When the connection to the architect runtime drops while viewing
    a document, the `DisconnectionBanner` renders above the content with a
    "Reconnect" action. The previously loaded document content remains visible
    and scrollable. The `DocTypeList` is visually disabled (greyed out) but not
    hidden. Auto-refresh is suspended — `rebuildGeneration` changes are ignored
    until reconnection. When the connection is re-established, auto-refresh
    triggers immediately to fetch fresh data. If the user navigates away from
    `/docs` while disconnected, `ConnectionGuard` redirects to `/connect`.

    **Rationale:** Connection drops are common during development — the architect
    process might restart, the config file might change, or the user might close
    the terminal session. Preserving the last loaded content (rather than showing
    an empty error state) respects the user's context. Disabling the type list
    (rather than hiding it) maintains spatial orientation. Immediate refresh on
    reconnection ensures the user sees fresh data without manual action.

    **Verified by:** Content preserved with disconnection banner,
    Reconnect action triggers recovery,
    Type list disabled during disconnection,
    Reconnection triggers immediate refresh

    @acceptance-criteria @happy-path
    Scenario: Content preserved with disconnection banner
      Given the user is viewing a document when connection drops
      When the ArchitectContext state transitions to "disconnected"
      Then a DisconnectionBanner appears above the document content
      And the banner message indicates the connection was lost
      And a "Reconnect" button is visible
      And the previously loaded document remains visible and scrollable

    @acceptance-criteria @happy-path
    Scenario: Reconnect action triggers connection recovery
      Given the DisconnectionBanner is shown
      When the user clicks "Reconnect"
      Then the connection flow initiates
      And the banner shows a connecting state
      When the connection is re-established
      Then the banner is removed
      And auto-refresh triggers with the current rebuildGeneration

    @acceptance-criteria @happy-path
    Scenario: Type list disabled during disconnection
      Given the connection is dropped while on /docs
      When the user looks at the DocTypeList
      Then all type entries are visually greyed out
      And clicking a type entry has no effect
      And the previously selected type remains highlighted

    @acceptance-criteria @edge-case
    Scenario: Reconnection triggers immediate refresh
      Given the user is viewing a stale document during disconnection
      When the connection is re-established and rebuildGeneration has advanced
      Then useArchitectDoc auto-refetches the current document
      And the stale overlay appears during the re-fetch
      And fresh content replaces the stale document when ready
