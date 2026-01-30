/**
 * Adapter interfaces for remote operations
 * Part of Milestone B: Outbox MVP
 * Part of Milestone C1: Delta Plumbing
 * Part of Milestone D: Signal + Lifecycle
 */

import type { Scope } from './types';

/**
 * Result of pushing an outbox operation
 */
export type OutboxPushResult =
  | { opId: string; status: 'succeeded' }
  | { opId: string; status: 'failed'; retryable: boolean; error: { code: string; message: string } }
  | { opId: string; status: 'blocked'; reason: string }; // e.g. auth required, paywall required

/**
 * Outbox operation payload
 */
export type OutboxOpPayload = {
  id: string;
  entityKey: string;
  opType: string;
  payload: unknown;
  idempotencyKey: string;
};

/**
 * Remote adapter for pushing outbox operations
 * Apps must implement this interface with their backend (e.g. Firestore)
 */
export interface RemoteOutboxAdapter {
  pushOps(scope: Scope, ops: OutboxOpPayload[]): Promise<OutboxPushResult[]>;
}

/**
 * Stub implementation for testing
 * Can be configured to succeed, fail, or simulate various scenarios
 */
export class StubOutboxAdapter implements RemoteOutboxAdapter {
  private behavior: 'succeed' | 'fail' | 'fail-then-succeed' | 'block';
  private failCount = 0;

  constructor(behavior: 'succeed' | 'fail' | 'fail-then-succeed' | 'block' = 'succeed') {
    this.behavior = behavior;
  }

  async pushOps(scope: Scope, ops: OutboxOpPayload[]): Promise<OutboxPushResult[]> {
    return ops.map((op) => {
      if (this.behavior === 'succeed') {
        return { opId: op.id, status: 'succeeded' as const };
      }

      if (this.behavior === 'fail') {
        return {
          opId: op.id,
          status: 'failed' as const,
          retryable: true,
          error: { code: 'stub_error', message: 'Stub adapter: simulated failure' },
        };
      }

      if (this.behavior === 'fail-then-succeed') {
        if (this.failCount < 1) {
          this.failCount++;
          return {
            opId: op.id,
            status: 'failed' as const,
            retryable: true,
            error: { code: 'stub_error', message: 'Stub adapter: fail then succeed (attempt 1)' },
          };
        }
        return { opId: op.id, status: 'succeeded' as const };
      }

      if (this.behavior === 'block') {
        return {
          opId: op.id,
          status: 'blocked' as const,
          reason: 'Stub adapter: simulated block (e.g. auth required)',
        };
      }

      return { opId: op.id, status: 'succeeded' as const };
    });
  }

  setBehavior(behavior: 'succeed' | 'fail' | 'fail-then-succeed' | 'block'): void {
    this.behavior = behavior;
    this.failCount = 0;
  }
}

/**
 * Delta change representation
 * Part of Milestone C1: Delta Plumbing
 */
export type DeltaChange =
  | { kind: 'upsert'; entityKey: string; entityId: string; data: unknown; updatedAt: number }
  | { kind: 'delete'; entityKey: string; entityId: string; updatedAt: number };

/**
 * Response from pulling delta changes
 * Part of Milestone C1: Delta Plumbing
 */
export type DeltaPullResponse = {
  changes: DeltaChange[];
  nextCursor: string;
  hasMore?: boolean;
};

/**
 * Remote adapter for pulling delta changes
 * Apps must implement this interface with their backend (e.g. Firestore)
 * Part of Milestone C1: Delta Plumbing
 */
export interface RemoteDeltaAdapter {
  pullChanges(scope: Scope, collectionKey: string, cursor: string): Promise<DeltaPullResponse>;
}

/**
 * Stub implementation for testing delta pulls
 * Can be configured to return various scenarios
 * Part of Milestone C1: Delta Plumbing
 */
export class StubDeltaAdapter implements RemoteDeltaAdapter {
  private behavior: 'empty' | 'with-changes' | 'paginated';
  private callCount = 0;

  constructor(behavior: 'empty' | 'with-changes' | 'paginated' = 'empty') {
    this.behavior = behavior;
  }

  async pullChanges(scope: Scope, collectionKey: string, cursor: string): Promise<DeltaPullResponse> {
    this.callCount++;

    if (this.behavior === 'empty') {
      // Return zero changes with a new cursor
      return {
        changes: [],
        nextCursor: `cursor_${Date.now()}`,
        hasMore: false,
      };
    }

    if (this.behavior === 'with-changes') {
      // Return some changes with a new cursor
      return {
        changes: [
          {
            kind: 'upsert',
            entityKey: collectionKey,
            entityId: 'item_1',
            data: { id: 'item_1', name: 'Test Item 1', updatedAt: Date.now() },
            updatedAt: Date.now(),
          },
          {
            kind: 'upsert',
            entityKey: collectionKey,
            entityId: 'item_2',
            data: { id: 'item_2', name: 'Test Item 2', updatedAt: Date.now() },
            updatedAt: Date.now(),
          },
        ],
        nextCursor: `cursor_${Date.now()}`,
        hasMore: false,
      };
    }

    if (this.behavior === 'paginated') {
      // Simulate pagination: first call returns changes with hasMore, second returns empty
      if (this.callCount === 1) {
        return {
          changes: [
            {
              kind: 'upsert',
              entityKey: collectionKey,
              entityId: 'item_1',
              data: { id: 'item_1', name: 'Test Item 1', updatedAt: Date.now() },
              updatedAt: Date.now(),
            },
          ],
          nextCursor: `cursor_page_1_${Date.now()}`,
          hasMore: true,
        };
      }
      return {
        changes: [],
        nextCursor: `cursor_page_2_${Date.now()}`,
        hasMore: false,
      };
    }

    // Default: empty
    return {
      changes: [],
      nextCursor: `cursor_${Date.now()}`,
      hasMore: false,
    };
  }

  setBehavior(behavior: 'empty' | 'with-changes' | 'paginated'): void {
    this.behavior = behavior;
    this.callCount = 0;
  }

  reset(): void {
    this.callCount = 0;
  }
}

/**
 * Remote adapter for signal listeners (lightweight "something changed" indicator)
 * Part of Milestone D: Signal + Lifecycle
 * 
 * The signal adapter must be "light": one listener per active scope.
 * It only triggers a delta catch-up; it does not stream full dataset state.
 */
export interface RemoteSignalAdapter {
  /**
   * Attach a signal listener for the given scope
   * @param scope The active scope to listen for signals
   * @param onSignal Callback when a signal is received (should trigger delta pull)
   * @param onError Callback when an error occurs
   * @returns Unsubscribe function to detach the listener
   */
  attach(
    scope: Scope,
    onSignal: () => void,
    onError: (e: { code: string; message: string }) => void
  ): () => void;
}

/**
 * Stub implementation for testing signal listeners
 * Part of Milestone D: Signal + Lifecycle
 * 
 * Can be configured to trigger signals manually (useful for dev/testing)
 */
export class StubSignalAdapter implements RemoteSignalAdapter {
  private listeners: Map<string, { onSignal: () => void; onError: (e: { code: string; message: string }) => void }> = new Map();
  private behavior: 'succeed' | 'error';

  constructor(behavior: 'succeed' | 'error' = 'succeed') {
    this.behavior = behavior;
  }

  attach(
    scope: Scope,
    onSignal: () => void,
    onError: (e: { code: string; message: string }) => void
  ): () => void {
    const scopeKey = scope.type === 'global' ? 'global' : `${scope.type}:${scope.id || ''}`;
    
    this.listeners.set(scopeKey, { onSignal, onError });

    // Return unsubscribe function
    return () => {
      this.listeners.delete(scopeKey);
    };
  }

  /**
   * Manually trigger a signal for testing/dev purposes
   * In a real implementation, this would be called by the remote system
   */
  triggerSignal(scope: Scope): void {
    const scopeKey = scope.type === 'global' ? 'global' : `${scope.type}:${scope.id || ''}`;
    const listener = this.listeners.get(scopeKey);
    
    if (listener) {
      if (this.behavior === 'error') {
        listener.onError({ code: 'stub_signal_error', message: 'Stub adapter: simulated signal error' });
      } else {
        listener.onSignal();
      }
    }
  }

  /**
   * Set behavior for signal adapter
   */
  setBehavior(behavior: 'succeed' | 'error'): void {
    this.behavior = behavior;
  }

  /**
   * Get count of active listeners (for testing)
   */
  getListenerCount(): number {
    return this.listeners.size;
  }
}
