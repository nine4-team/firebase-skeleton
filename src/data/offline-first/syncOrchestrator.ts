/**
 * Sync orchestrator
 * Part of Milestone B: Outbox MVP
 * Part of Milestone C1: Delta Plumbing
 * Part of Milestone D: Signal + Lifecycle
 * 
 * Manages outbox processing, delta pulls, signal listeners, and app lifecycle.
 */

import { OutboxProcessor } from './outboxProcessor';
import { DeltaRunner } from './deltaRunner';
import { useSyncStore } from './syncStore';
import { subscribeSyncStatus } from './syncStore';
import type { RemoteOutboxAdapter, RemoteDeltaAdapter, RemoteSignalAdapter } from './adapters';
import type { Scope, SyncStatus } from './types';
import { getNetworkStatus, subscribeNetworkStatus } from './networkStatus';
import type { DeltaChangeHandler, ConflictDetector } from './applyEngine';
import { AppState, type AppStateStatus } from 'react-native';

export interface SyncOrchestratorConfig {
  outboxBatchSize?: number;
  outboxMaxAttempts?: number;
  outboxBackoffMs?: number;
  outboxMaxBackoffMs?: number;
  processingIntervalMs?: number; // How often to check for pending ops
  deltaMaxPagesPerRun?: number; // Maximum pages to pull per delta run
  collectionKeys?: string[]; // Collection keys to sync (for delta pulls)
  deltaChangeHandler?: DeltaChangeHandler; // Handler for applying delta changes (Milestone C2)
  conflictDetector?: ConflictDetector; // Conflict detector (Milestone E)
  signalDebounceMs?: number; // Debounce delay for signal-triggered syncs (default: 1000ms)
}

const DEFAULT_CONFIG: Required<Omit<SyncOrchestratorConfig, 'collectionKeys'>> & { collectionKeys?: string[] } = {
  outboxBatchSize: 10,
  outboxMaxAttempts: 5,
  outboxBackoffMs: 1000,
  outboxMaxBackoffMs: 60000,
  processingIntervalMs: 2000, // Check every 2 seconds
  deltaMaxPagesPerRun: 10,
  signalDebounceMs: 1000, // Debounce signals by 1 second
};

/**
 * Sync orchestrator
 * Manages outbox processing, delta pulls, signal listeners, and sync status
 * Part of Milestone D: Signal + Lifecycle
 */
export class SyncOrchestrator {
  private processor: OutboxProcessor;
  private deltaRunner: DeltaRunner | null = null;
  private signalAdapter: RemoteSignalAdapter | null = null;
  private config: SyncOrchestratorConfig & { collectionKeys?: string[] };
  private activeScope: Scope | null = null;
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private isStarted = false;
  private networkStatusUnsubscribe: (() => void) | null = null;
  private signalUnsubscribe: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private signalDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isPaused = false; // Paused when app is in background

  constructor(
    outboxAdapter: RemoteOutboxAdapter,
    deltaAdapter?: RemoteDeltaAdapter,
    signalAdapter?: RemoteSignalAdapter,
    config?: SyncOrchestratorConfig
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.processor = new OutboxProcessor(outboxAdapter, {
      batchSize: this.config.outboxBatchSize!,
      maxAttempts: this.config.outboxMaxAttempts!,
      backoffMs: this.config.outboxBackoffMs!,
      maxBackoffMs: this.config.outboxMaxBackoffMs!,
    });

    // Create delta runner if adapter is provided
    // Part of Milestone C2: pass handler to DeltaRunner
    // Part of Milestone E: pass conflict detector to DeltaRunner
    if (deltaAdapter) {
      this.deltaRunner = new DeltaRunner(
        deltaAdapter,
        this.config.deltaChangeHandler,
        {
          maxPagesPerRun: this.config.deltaMaxPagesPerRun,
          conflictDetector: this.config.conflictDetector,
        }
      );
    }

    // Store signal adapter (optional)
    this.signalAdapter = signalAdapter || null;
  }

  /**
   * Dev-only helper to trigger a signal on adapters that support it.
   * Returns true if a signal was triggered.
   */
  debugTriggerSignal(scope?: Scope): boolean {
    const targetScope = scope ?? this.activeScope;
    if (!targetScope || !this.signalAdapter) {
      return false;
    }

    const adapter = this.signalAdapter as { triggerSignal?: (scope: Scope) => void };
    if (typeof adapter.triggerSignal !== 'function') {
      return false;
    }

    adapter.triggerSignal(targetScope);
    return true;
  }

  /**
   * Start the orchestrator
   * Part of Milestone D: Signal + Lifecycle
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;

    // Subscribe to network status changes
    this.networkStatusUnsubscribe = subscribeNetworkStatus((isOnline) => {
      useSyncStore.getState().updateStatus({ isOnline });
    });

    // Subscribe to app state changes (background/foreground)
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange.bind(this));

    // Start processing loop if we have an active scope
    if (this.activeScope) {
      this.startProcessingLoop();
      this.attachSignalListener();
    }
  }

  /**
   * Stop the orchestrator
   * Part of Milestone D: Signal + Lifecycle
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;
    this.stopProcessingLoop();
    this.detachSignalListener();

    if (this.networkStatusUnsubscribe) {
      this.networkStatusUnsubscribe();
      this.networkStatusUnsubscribe = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (this.signalDebounceTimer) {
      clearTimeout(this.signalDebounceTimer);
      this.signalDebounceTimer = null;
    }
  }

  /**
   * Start sync for a specific scope
   * Part of Milestone D: Signal + Lifecycle
   */
  async startScopeSync(scope: Scope): Promise<void> {
    // Detach old signal listener if switching scopes
    this.detachSignalListener();

    this.activeScope = scope;

    // Refresh pending count
    await useSyncStore.getState().refreshPendingCount(scope);

    // Start processing loop if orchestrator is started
    if (this.isStarted) {
      this.startProcessingLoop();
      this.attachSignalListener();
    }

    // Run initial delta catch-up
    if (this.deltaRunner && this.config.collectionKeys && this.config.collectionKeys.length > 0) {
      await this.runDeltaPull();
    }
  }

  /**
   * Stop scope sync
   * Part of Milestone D: Signal + Lifecycle
   */
  async stopScopeSync(): Promise<void> {
    this.detachSignalListener();
    this.activeScope = null;
    this.stopProcessingLoop();
  }

  /**
   * Trigger a foreground sync (flush outbox + delta catch-up)
   * Part of Milestone C1: Delta Plumbing
   */
  async triggerForegroundSync(): Promise<void> {
    if (!this.activeScope) {
      return;
    }

    const status = useSyncStore.getState();
    status.updateStatus({ isSyncing: true });

    try {
      // Phase 1: Process outbox (push local changes)
      await this.processOutbox();

      // Phase 2: Delta catch-up (pull remote changes)
      // Only run if delta adapter is configured and we have collection keys
      if (this.deltaRunner && this.config.collectionKeys && this.config.collectionKeys.length > 0) {
        await this.runDeltaPull();
      }

      status.updateStatus({
        isSyncing: false,
        lastSyncAt: Date.now(),
      });

      // Refresh pending count
      await status.refreshPendingCount(this.activeScope);
    } catch (error) {
      const errorObj = error instanceof Error
        ? { code: 'sync_error', message: error.message }
        : { code: 'sync_error', message: String(error) };

      status.setError(errorObj);
      status.updateStatus({ isSyncing: false });
    }
  }

  /**
   * Run delta pull for all configured collections
   * Part of Milestone C1: Delta Plumbing
   */
  private async runDeltaPull(): Promise<void> {
    if (!this.activeScope || !this.deltaRunner || !this.config.collectionKeys) {
      return;
    }

    const isOnline = getNetworkStatus();
    if (!isOnline) {
      return;
    }

    // Run delta pull for all configured collections
    await this.deltaRunner.runDeltaPullForCollections(
      this.activeScope,
      this.config.collectionKeys
    );
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return useSyncStore.getState().status;
  }

  /**
   * Subscribe to status changes
   */
  subscribeStatus(cb: (status: SyncStatus) => void): () => void {
    return subscribeSyncStatus(cb);
  }

  /**
   * Process outbox operations
   */
  private async processOutbox(): Promise<void> {
    if (!this.activeScope) {
      return;
    }

    const isOnline = getNetworkStatus();
    if (!isOnline) {
      return;
    }

    const store = useSyncStore.getState();
    const wasSyncing = store.status.isSyncing;
    if (!wasSyncing) {
      store.updateStatus({ isSyncing: true });
    }

    // Process batches until no more pending ops
    try {
      let processed = 0;
      do {
        processed = await this.processor.processBatch(this.activeScope);
        // Refresh pending count after each batch
        await store.refreshPendingCount(this.activeScope);
      } while (processed > 0);
    } finally {
      if (!wasSyncing) {
        store.updateStatus({ isSyncing: false });
      }
    }
  }

  /**
   * Start the processing loop
   */
  private startProcessingLoop(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(async () => {
      if (!this.activeScope || this.isPaused) {
        return;
      }

      const status = useSyncStore.getState().status;
      const isOnline = getNetworkStatus();

      // Update network status if changed
      if (status.isOnline !== isOnline) {
        useSyncStore.getState().updateStatus({ isOnline });
      }

      // Only process if online and not already syncing
      if (isOnline && !status.isSyncing && status.pendingOutboxOps > 0) {
        await this.processOutbox();
      }
    }, this.config.processingIntervalMs);
  }

  /**
   * Stop the processing loop
   */
  private stopProcessingLoop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Attach signal listener for the active scope
   * Part of Milestone D: Signal + Lifecycle
   */
  private attachSignalListener(): void {
    if (!this.signalAdapter || !this.activeScope) {
      return;
    }

    // Detach any existing listener first
    this.detachSignalListener();

    // Attach new listener with debounced signal handler
    this.signalUnsubscribe = this.signalAdapter.attach(
      this.activeScope,
      () => {
        // Debounce signal-triggered syncs
        if (this.signalDebounceTimer) {
          clearTimeout(this.signalDebounceTimer);
        }

        this.signalDebounceTimer = setTimeout(() => {
          // Only trigger delta pull (not full sync) when signal is received
          // Outbox processing continues via the processing loop
          if (!this.isPaused && this.activeScope) {
            this.runDeltaPull().catch((error) => {
              console.error('Error in signal-triggered delta pull:', error);
              const errorObj = error instanceof Error
                ? { code: 'signal_sync_error', message: error.message }
                : { code: 'signal_sync_error', message: String(error) };
              useSyncStore.getState().setError(errorObj);
            });
          }
          this.signalDebounceTimer = null;
        }, this.config.signalDebounceMs);
      },
      (error) => {
        console.error('Signal adapter error:', error);
        useSyncStore.getState().setError(error);
      }
    );
  }

  /**
   * Detach signal listener
   * Part of Milestone D: Signal + Lifecycle
   */
  private detachSignalListener(): void {
    if (this.signalUnsubscribe) {
      this.signalUnsubscribe();
      this.signalUnsubscribe = null;
    }

    if (this.signalDebounceTimer) {
      clearTimeout(this.signalDebounceTimer);
      this.signalDebounceTimer = null;
    }
  }

  /**
   * Handle app state changes (background/foreground)
   * Part of Milestone D: Signal + Lifecycle
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      // App going to background: detach listener, pause or slow processor
      this.isPaused = true;
      this.detachSignalListener();
      // Keep processing loop running but slower (or pause it)
      // For now, we'll keep it running but it won't process when paused
    } else if (nextAppState === 'active') {
      // App coming to foreground: reattach listener, run delta catch-up
      this.isPaused = false;
      if (this.activeScope) {
        this.attachSignalListener();
        // Run delta catch-up on resume
        this.triggerForegroundSync().catch((error) => {
          console.error('Error in foreground sync:', error);
        });
      }
    }
  }
}
