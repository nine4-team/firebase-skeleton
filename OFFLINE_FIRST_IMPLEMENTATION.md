### Offline-First Implementation (Generalizable Skeleton)

This document is the **implementation spec** for adding an **offline-first (local-first)** data mode to this template without baking in any product-specific domain concepts (projects, inventory, etc.).

It is designed to be:
- **Generalizable**: domain tables, collection paths, and business rules live in app code, not the skeleton.
- **Implementable**: concrete SQLite tables, lifecycle, and interfaces are defined here.
- **Cost-aware** (Firebase-friendly): prefer **incremental pulls** + **single “signal” listener** instead of broad always-on Firestore listeners.

This spec intentionally complements (and supersedes in detail) the high-level notes in `src/data/offline-first.md`.

---

### Non-goals

- Perfect background sync on iOS (best-effort only).
- Building a full domain model (entity schemas are app-defined).
- Solving every conflict strategy up front (provide hooks and a safe default).

---

### Implementation Status

**Last Updated**: 2026-01-29

- ✅ **Milestone A — local DB foundation** (COMPLETE)
  - SQLite lifecycle implemented (`src/data/offline-first/db.ts`)
  - Migration system using `PRAGMA user_version` working
  - Skeleton tables created: `kv`, `sync_cursors`, `outbox_ops`, `conflicts`
  - Helper functions: `withTransaction`, `nowMs`, `safeJsonEncode/decode`
  - KV store interface (`src/data/offline-first/kv.ts`)
  - Safe-mode UI for migration failures (`src/components/SafeModeScreen.tsx`)
  - Database initialization integrated into app boot sequence
- ✅ **Milestone B — outbox MVP** (COMPLETE)
  - Outbox queue + processor (`src/data/offline-first/outbox.ts`, `outboxProcessor.ts`)
  - Remote adapter interface + stub (`src/data/offline-first/adapters.ts`)
  - Sync status store + orchestrator (`syncStore.ts`, `syncOrchestrator.ts`)
  - Network status helper + subscription (`networkStatus.ts`)
- ✅ **Milestone C1 — delta plumbing** (COMPLETE)
  - `RemoteDeltaAdapter` interface + stub (`src/data/offline-first/adapters.ts`)
  - Cursor read/write functions (`getCursor`, `setCursor` in `deltaRunner.ts`)
  - `DeltaRunner` class that calls `pullChanges` and persists `nextCursor` (`deltaRunner.ts`)
  - Delta pull integrated into `SyncOrchestrator.triggerForegroundSync()`
- ✅ **Milestone C2 — apply engine** (COMPLETE)
  - Apply engine with handler interface (`applyUpsert`, `applyDelete`) (`src/data/offline-first/applyEngine.ts`)
  - Example entity table (`example_items`) and handler (`src/data/offline-first/exampleHandler.ts`)
  - Delta changes applied to SQLite within transactions (`DeltaRunner` updated)
  - Idempotent operations ensured (INSERT OR REPLACE, DELETE WHERE id = ?)
- ✅ **Milestone D — signal + lifecycle** (COMPLETE)
  - `RemoteSignalAdapter` interface + stub (`src/data/offline-first/adapters.ts`)
  - Signal listener attach/detach with debouncing (`SyncOrchestrator`)
  - AppState handling for background/foreground transitions
  - Global UX components: `OfflineBanner`, `SyncStatusIndicator`, `RetrySyncButton`, `SyncStatusBar`
  - Sync orchestrator store/hook (`src/data/offline-first/syncOrchestratorStore.ts`)
  - Components integrated into app layout
- ✅ **Milestone E — conflicts + dev tooling** (COMPLETE)

---

### Core invariants (must always hold)

- **Reads**: UI reads from **SQLite** (or derived in-memory state backed by SQLite). Screens must not depend on Firestore listeners for primary data.
- **Writes**: every mutation is:
  1) validated (domain layer),
  2) written **transactionally** to SQLite,
  3) appended to an **outbox** table,
  4) reflected immediately in UI (because SQLite changed).
- **Sync**:
  - Outbox flush + delta pull are **separate phases**.
  - Sync is **idempotent** (safe to retry).
  - A single “signal” subscription (optional) **only triggers** a delta catch-up; it does not stream full dataset state.
- **Resilience**: DB migrations and sync failures must not brick the app; show a safe-mode UI and allow reset/export logs in dev builds.

---

### Glossary

- **Local store**: SQLite DB + migrations + query subscriptions.
- **Outbox**: queued write operations persisted locally for later push.
- **Delta pull**: “pull changes since cursor” and apply to SQLite.
- **Signal**: a lightweight remote “something changed” indicator (e.g. a single doc) that triggers delta pull.
- **Scope**: optional active context (e.g. “workspace”, “project”, “account”). Skeleton supports **one active scope at a time**, but does not define what scopes mean.

---

### Boot sequence (startup order)

The app should follow this order at startup:

1) **Crash-safe init**
   - Initialize logging (dev vs prod behavior).
   - Register global error boundary.
   - Provide safe-mode UI for fatal init failures (DB migration failure, corrupted local state).

2) **Auth bootstrap**
   - Restore session from secure storage (Firebase Auth handles this).
   - Derive `authState: loading | authenticated | unauthenticated` and `uid?`.
   - If unauthenticated **and offline**, login flows must show “requires connection”.

3) **Scope selection (optional)**
   - Determine the active scope (if your app uses scopes).
   - Skeleton only needs: `getActiveScope()` and a way to switch it.

4) **Local DB init + migrations**
   - Open SQLite.
   - Run migrations using `PRAGMA user_version`.
   - Validate required skeleton tables exist.

5) **Hydrate UI from SQLite**
   - Render immediately from local state (even offline).
   - Do not block UI on network calls.

6) **Sync wiring**
   - Start outbox processor loop (foreground).
   - If a scope is active:
     - run one delta catch-up pass immediately,
     - attach **one** scope signal listener (optional).

Foreground/background:
- On background: detach signal listener; pause or slow outbox processing.
- On resume: delta catch-up; reattach signal listener.

---

### Public interfaces (skeleton-owned)

The skeleton should expose a small, stable API surface.

#### `Scope`

```ts
export type Scope =
  | { type: 'global' }
  | { type: string; id?: string };
```

Notes:
- `'global'` is a safe default for apps without scoping.
- Apps can define additional scope types (e.g. `{ type: 'workspace', id: workspaceId }`).

#### `SyncStatus`

```ts
export type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOutboxOps: number;
  lastSyncAt?: number; // epoch ms
  lastError?: { code: string; message: string; at: number };
};
```

#### `SyncOrchestrator`

```ts
export interface SyncOrchestrator {
  start(): Promise<void>;
  stop(): Promise<void>;

  startScopeSync(scope: Scope): Promise<void>;
  stopScopeSync(): Promise<void>;

  triggerForegroundSync(): Promise<void>; // flush outbox + delta catch-up
  getStatus(): SyncStatus;
  subscribeStatus(cb: (s: SyncStatus) => void): () => void;
}
```

#### `Repository<T>` (already exists conceptually)

The repository interface is the “screen-facing” boundary. Offline-first implementations must:
- read from SQLite (not Firestore),
- write to SQLite + outbox,
- optionally expose optimistic metadata (e.g. `syncState` fields) via local tables.

---

### Local database schema (skeleton tables)

The skeleton owns only “infrastructure tables”. Apps own domain/entity tables.

#### 1) `kv` (small metadata)

- Purpose: store small key/value items (active scope, feature flags, etc.).

Fields:
- `key TEXT PRIMARY KEY`
- `value TEXT NOT NULL` (JSON string)
- `updated_at INTEGER NOT NULL` (epoch ms)

#### 2) `sync_cursors`

- Purpose: store “last applied cursor” per (scope, collection).

Fields:
- `scope_key TEXT NOT NULL` (e.g. `'global'` or `'workspace:abc'`)
- `collection_key TEXT NOT NULL` (app-defined stable string)
- `cursor TEXT NOT NULL` (opaque string; may be timestamp, doc ID, etc.)
- `updated_at INTEGER NOT NULL`
- PRIMARY KEY (`scope_key`, `collection_key`)

#### 3) `outbox_ops`

- Purpose: persist mutations to push to the server.

Fields (suggested):
- `id TEXT PRIMARY KEY` (uuid)
- `scope_key TEXT NOT NULL`
- `entity_key TEXT NOT NULL` (e.g. `'tasks'`, `'notes'` — app-defined)
- `op_type TEXT NOT NULL` (`'upsert' | 'delete' | 'custom'`)
- `idempotency_key TEXT NOT NULL` (stable across retries; unique per logical op)
- `payload_json TEXT NOT NULL` (JSON; includes entity id + fields)
- `attempt_count INTEGER NOT NULL DEFAULT 0`
- `state TEXT NOT NULL` (`'pending' | 'in_flight' | 'succeeded' | 'failed' | 'blocked'`)
- `last_error_json TEXT` (JSON)
- `created_at INTEGER NOT NULL`
- `updated_at INTEGER NOT NULL`

Indexes:
- (`state`, `created_at`)
- (`scope_key`, `state`, `created_at`)

#### 4) `conflicts` (optional but recommended)

- Purpose: represent conflicts that require UI attention (if you support conflict surfacing).

Fields (suggested):
- `id TEXT PRIMARY KEY`
- `scope_key TEXT NOT NULL`
- `entity_key TEXT NOT NULL`
- `entity_id TEXT NOT NULL`
- `local_version_json TEXT NOT NULL`
- `remote_version_json TEXT NOT NULL`
- `created_at INTEGER NOT NULL`
- `resolved_at INTEGER` (nullable)

---

### Adapter interfaces (app- or integration-owned)

To keep the skeleton general, remote details live behind adapters.

#### `RemoteOutboxAdapter` (push)

```ts
export type OutboxPushResult =
  | { opId: string; status: 'succeeded' }
  | { opId: string; status: 'failed'; retryable: boolean; error: { code: string; message: string } }
  | { opId: string; status: 'blocked'; reason: string }; // e.g. auth required, paywall required

export interface RemoteOutboxAdapter {
  pushOps(scope: Scope, ops: Array<{ id: string; entityKey: string; opType: string; payload: unknown; idempotencyKey: string }>): Promise<OutboxPushResult[]>;
}
```

#### `RemoteDeltaAdapter` (pull)

```ts
export type DeltaChange =
  | { kind: 'upsert'; entityKey: string; entityId: string; data: unknown; updatedAt: number }
  | { kind: 'delete'; entityKey: string; entityId: string; updatedAt: number };

export type DeltaPullResponse = {
  changes: DeltaChange[];
  nextCursor: string;
  hasMore?: boolean;
};

export interface RemoteDeltaAdapter {
  pullChanges(scope: Scope, collectionKey: string, cursor: string): Promise<DeltaPullResponse>;
}
```

#### `RemoteSignalAdapter` (optional)

```ts
export interface RemoteSignalAdapter {
  attach(scope: Scope, onSignal: () => void, onError: (e: { code: string; message: string }) => void): () => void;
}
```

Notes:
- Skeleton must function without signals (manual/periodic delta pulls).
- Signal adapter must be “light”: one listener per active scope.

---

### Sync algorithm (reference behavior)

#### Outbox flush (push phase)

Loop while:
- online, authenticated (if required),
- and there are pending ops,
- and not paused/backgrounded.

Behavior:
- Claim N ops (e.g. 10) in FIFO order.
- Mark `in_flight`.
- Call `RemoteOutboxAdapter.pushOps(...)`.
- For each result:
  - `succeeded`: mark op `succeeded` (or delete row).
  - `failed`:
    - if retryable: increment attempts, mark `pending`, store error, apply backoff.
    - else: mark `failed` (visible in UI).
  - `blocked`: mark `blocked` (requires user action; visible in UI).

Idempotency:
- Every op must have an `idempotency_key`.
- Remote writes must be implemented so repeating the same op is safe.

#### Delta catch-up (pull phase)

For each `collectionKey` configured for the app:
- Read cursor from `sync_cursors` (default cursor = `'0'` or empty).
- Pull changes in pages until `hasMore` is false (or page limit hit).
- Apply changes transactionally to SQLite:
  - `upsert` → upsert into entity table
  - `delete` → soft-delete or delete from entity table (app-defined)
- Persist `nextCursor` in `sync_cursors`.

Conflict handling (minimum viable):
- Default to **LWW** by `updatedAt` if the app provides it.
- If a local row has un-synced changes and a remote upsert arrives:
  - Either (a) keep local and defer remote until outbox clears, or
  - (b) mark a conflict row and surface it.
Choose a default and make it explicit; provide hooks for domain overrides.

---

### UX requirements (always-on)

The skeleton should provide these global components (or patterns) and wire them to `SyncOrchestrator`:

- **Network status banner**
  - offline / online messaging
  - never blocks reading local data

- **Sync status indicator**
  - pending outbox ops count
  - syncing state
  - last error summary (tap to details in dev)

- **Retry sync action**
  - calls `triggerForegroundSync()`

- **Conflict indicator**
  - non-blocking indicator when conflicts exist
  - navigation hook to a conflict screen (app supplies screen)

---

### Logging + observability (client)

Minimum structured events to log:
- app start/resume/background
- auth transitions
- DB migration success/failure
- outbox: op started/succeeded/failed (with codes), queue size
- delta: run started/completed, counts per entityKey, cursor updates
- signal: attached/detached/errors

Error boundary behavior:
- safe fallback UI
- allow retry initialization
- allow “reset local cache” (guarded) and “export logs” (dev)

---

### Configuration surface (skeleton-owned)

Keep config minimal and generic. Suggested:

```ts
export type OfflineFirstConfig = {
  enabled: boolean;
  defaultScope: Scope; // usually { type: 'global' }
  collections: Array<{
    collectionKey: string; // stable identifier
    entityKey: string;     // stable identifier used in local tables
  }>;
  sync: {
    outboxBatchSize: number;
    deltaPageSize: number;
    maxDeltaPagesPerForegroundSync: number;
  };
};
```

Apps provide:
- entity table definitions (SQL) and mappers,
- adapter implementations (e.g. Firestore-backed),
- optional scope selector UI.

---

### Milestones (incremental implementation plan)

The milestones below are intentionally sized so an AI dev can implement them in small, verifiable increments.

Each milestone has:
- **Deliverables**: what code exists after the milestone
- **Definition of Done**: concrete checks you can run/verify (even manually) before moving on
- **Stub vs real**: what is allowed to be mocked to reduce integration risk

#### Milestone A — local DB foundation ✅ COMPLETE

- **Deliverables** ✅
  - ✅ SQLite open + close lifecycle (`src/data/offline-first/db.ts`)
  - ✅ Migrations using `PRAGMA user_version` (migration system implemented)
  - ✅ Skeleton infra tables created: `kv`, `sync_cursors`, `outbox_ops`, `conflicts`
  - ✅ Tiny helpers: `withTransaction(db, fn)`, `nowMs()`, `safeJsonEncode/decode`

- **Definition of Done** ✅
  - ✅ App can start and open DB without crashing (integrated into `app/_layout.tsx`)
  - ✅ `user_version` increments as migrations run; a second start is a no-op
  - ✅ Can `set/get` a JSON value in `kv` and read it back after app restart (`src/data/offline-first/kv.ts`)
  - ✅ A failing migration triggers safe-mode UI (`src/components/SafeModeScreen.tsx`)

- **Implementation Notes**
  - Database initialization hook: `useDatabaseInit()` in `src/data/offline-first/dbStore.ts`
  - Database lifecycle managed in app root layout
  - Safe-mode UI shows error details and retry option
  - Reset local cache UI prepared (implementation deferred to later milestone)

- **Stub vs real**
  - No network.
  - No domain/entity tables required yet.

#### Milestone B — outbox MVP ✅ COMPLETE

- **Deliverables** ✅
  - ✅ `Outbox.enqueue(...)` that inserts rows into `outbox_ops`.
  - ✅ `OutboxProcessor` that claims a batch, marks `in_flight`, calls `RemoteOutboxAdapter.pushOps`, and updates states.
  - ✅ `SyncStatus` store with `pendingOutboxOps` and `lastError`.
  - ✅ Backoff policy stored per op via `attempt_count` + `updated_at` (exponential + jitter).
  - ✅ `SyncOrchestrator` loop with manual foreground trigger.
  - ✅ Network status helper + subscription for `isOnline`.

- **Definition of Done** ✅
  - ✅ Enqueueing an op increases `pendingOutboxOps`.
  - ✅ Processor transitions `pending -> in_flight -> succeeded` with a stub adapter.
  - ✅ Retryable failures increment `attempt_count` and return to `pending` after backoff delay.
  - ✅ Non-retryable failures end in `failed` and show up in logs.

- **Stub vs real**
  - `RemoteOutboxAdapter` may be a deterministic stub (e.g. “succeed all”, “fail first time then succeed”).
  - No delta pull yet.

#### Milestone C1 — delta plumbing (no apply yet) ✅ COMPLETE

- **Deliverables** ✅
  - ✅ `RemoteDeltaAdapter` contract + deterministic stub adapter.
  - ✅ Cursor read/write in `sync_cursors` with a default cursor per (`scope_key`, `collection_key`).
  - ✅ `DeltaRunner` that calls `pullChanges(...)` and persists `nextCursor`.

- **Definition of Done** ✅
  - ✅ With a stub adapter that returns zero changes and a new cursor, the cursor advances and persists across restarts.
  - ✅ `triggerForegroundSync()` can run delta without touching domain tables.

- **Stub vs real**
  - Delta responses may be fully stubbed.
  - No entity table writes yet (changes are ignored or counted only).

#### Milestone C2 — apply engine (minimal, still general) ✅ COMPLETE

- **Deliverables**
  - An “apply changes” engine that runs inside a SQLite transaction.
  - ✅ `DeltaChangeHandler` interface with `applyUpsert` and `applyDelete` methods
  - ✅ `applyChange` and `applyChanges` functions that run within SQLite transactions
  - ✅ Example entity table (`example_items`) and handler (`src/data/offline-first/exampleHandler.ts`)
  - ✅ `CompositeDeltaHandler` for handling multiple entity types
  - ✅ DeltaRunner updated to apply changes using the handler
  - ✅ SyncOrchestrator updated to accept and pass handler to DeltaRunner

- **Definition of Done** ✅
  - ✅ Changes are applied to SQLite within a single transaction per page (atomicity)
  - ✅ Idempotency ensured: `INSERT OR REPLACE` for upserts, `DELETE WHERE id = ?` for deletes
  - ✅ Handler interface allows apps to implement their own entity table logic
  - ✅ Example handler demonstrates correct pattern (marked as removable)
  - ✅ Cursor does not advance if apply fails (prevents skipped changes)

- **Implementation Notes**
  - Apply engine uses `withTransaction` to ensure all-or-nothing semantics
  - Individual change errors are collected while applying a batch, then the batch is rolled back
  - Delta cursor is only advanced when the batch applies cleanly
  - Handler methods are async to allow for complex apply logic if needed
  - Example `example_items` table created in migration version 2
  - Example handler uses LWW (Last Write Wins) strategy by `updatedAt`

- **Stub vs real**
  - Remote adapter may remain stubbed; the point is verifying apply correctness.

#### Milestone D — signal + lifecycle ✅ COMPLETE

- **Deliverables** ✅
  - ✅ `RemoteSignalAdapter` contract and stub implementation (`src/data/offline-first/adapters.ts`)
  - ✅ Signal listener attach/detach wiring in `SyncOrchestrator` (one listener per active scope)
  - ✅ AppState wiring:
    - ✅ on background: detach listener; pause processor (`isPaused` flag)
    - ✅ on resume: run delta catch-up; reattach listener
  - ✅ Global UX components:
    - ✅ `OfflineBanner` - shows offline state (from network state)
    - ✅ `SyncStatusIndicator` - shows sync status, pending ops, errors (from `SyncStatus`)
    - ✅ `RetrySyncButton` - button to trigger `triggerForegroundSync()`
    - ✅ `SyncStatusBar` - combines banner and indicator
  - ✅ Sync orchestrator store/hook (`src/data/offline-first/syncOrchestratorStore.ts`)
  - ✅ Components integrated into app layout (`app/_layout.tsx`)

- **Definition of Done** ✅
  - ✅ Signal adapter attach/detach properly manages listeners (no leaks)
  - ✅ Signal-triggered syncs are debounced (configurable via `signalDebounceMs`)
  - ✅ AppState transitions properly pause/resume sync and manage listeners
  - ✅ Offline banner shows offline state; local reads still work
  - ✅ Sync status indicator shows pending ops, syncing state, and errors

- **Implementation Notes**
  - Signal adapter uses debouncing to prevent rapid-fire syncs (default 1 second)
  - AppState handling pauses processing loop when app goes to background
  - Signal listener is automatically attached when scope sync starts and detached when stopped
  - UX components are non-blocking and only show when relevant
  - `SyncStatusBar` combines offline banner and sync indicator for cleaner UI
  - App root initializes the global orchestrator after DB init and starts a default `global` scope sync

- **Stub vs real**
  - App wiring uses stub adapters by default; replace with real adapters before production.

#### Milestone E — conflicts + dev tooling ✅ COMPLETE

- **Deliverables**
  - Conflict representation in SQLite (`conflicts`) + hooks for `onConflict(...)`.
  - A dev-only debug surface to inspect:
    - outbox ops + states
    - cursors
    - last sync error
    - force “signal” and “foreground sync”

- **Definition of Done**
  - Conflicts can be created deterministically (via a test adapter) and are surfaced via a non-blocking indicator.
  - Dev tooling makes it easy to understand “why didn’t my changes sync?” without attaching a debugger.

- **Implementation Notes**
  - The debug screen can manually trigger a signal when the signal adapter supports it (e.g. `StubSignalAdapter`).
  - The debug screen includes toggles to simulate outbox success/failure when using stub adapters.

