/**
 * Offline-first data layer
 * Exports public API for Milestone A: Local DB Foundation
 * Exports public API for Milestone B: Outbox MVP
 * Exports public API for Milestone C1: Delta Plumbing
 * Exports public API for Milestone C2: Apply Engine
 * Exports public API for Milestone D: Signal + Lifecycle
 * Exports public API for Milestone E: Conflicts + Dev Tooling
 */

export {
  initializeDatabase,
  closeDatabase,
  resetDatabase,
  getDatabase,
  isDatabaseInitialized,
  getInitError,
  withTransaction,
  nowMs,
  safeJsonEncode,
  safeJsonDecode,
  type Database,
} from './db';

export { setKV, getKV, deleteKV, hasKV, getAllKeys } from './kv';

export {
  type Scope,
  type SyncStatus,
  scopeKey,
} from './types';

export {
  type RemoteOutboxAdapter,
  type OutboxPushResult,
  type OutboxOpPayload,
  StubOutboxAdapter,
  type RemoteDeltaAdapter,
  type DeltaChange,
  type DeltaPullResponse,
  StubDeltaAdapter,
  type RemoteSignalAdapter,
  StubSignalAdapter,
} from './adapters';

export {
  Outbox,
  type OutboxOp,
  type OutboxOpType,
  type OutboxOpState,
  type EnqueueOptions,
} from './outbox';

export {
  OutboxProcessor,
  type OutboxProcessorConfig,
} from './outboxProcessor';

export {
  useSyncStore,
  subscribeSyncStatus,
} from './syncStore';

export {
  SyncOrchestrator,
  type SyncOrchestratorConfig,
} from './syncOrchestrator';

export {
  initializeSyncOrchestrator,
  getSyncOrchestrator,
  resetSyncOrchestrator,
  useSyncOrchestrator,
} from './syncOrchestratorStore';

export {
  useNetworkStatus,
  getNetworkStatus,
  subscribeNetworkStatus,
} from './networkStatus';

export {
  DeltaRunner,
  type DeltaRunnerConfig,
  getCursor,
  setCursor,
} from './deltaRunner';

export {
  type DeltaChangeHandler,
  type ConflictDetector,
  applyChange,
  applyChanges,
} from './applyEngine';

export {
  DefaultConflictDetector,
} from './conflictDetector';

export {
  createConflict,
  resolveConflict,
  resolveConflictsForEntity,
  getUnresolvedConflicts,
  getAllConflicts,
  getConflictsWithVersions,
  countUnresolvedConflicts,
  hasConflict,
  deleteResolvedConflicts,
  type Conflict,
  type ConflictWithVersions,
} from './conflicts';

export {
  ExampleDeltaHandler,
  CompositeDeltaHandler,
  type ExampleItem,
} from './exampleHandler';
