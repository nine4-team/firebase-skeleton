/**
 * Sync status store
 * Part of Milestone B: Outbox MVP
 */

import { create } from 'zustand';
import type { SyncStatus } from './types';
import { Outbox } from './outbox';
import type { Scope } from './types';

// Subscriber management (outside of Zustand store)
const statusSubscribers = new Set<(status: SyncStatus) => void>();

function notifySubscribers(status: SyncStatus) {
  statusSubscribers.forEach((cb) => {
    try {
      cb(status);
    } catch (error) {
      console.error('Error in sync status subscriber:', error);
    }
  });
}

interface SyncStoreState {
  status: SyncStatus;
  updateStatus: (updates: Partial<SyncStatus>) => void;
  refreshPendingCount: (scope: Scope) => Promise<void>;
  setError: (error: { code: string; message: string } | null) => void;
  clearError: () => void;
}

/**
 * Create initial sync status
 */
function createInitialStatus(): SyncStatus {
  return {
    isOnline: true, // Will be updated by network status
    isSyncing: false,
    pendingOutboxOps: 0,
    lastSyncAt: undefined,
    lastError: undefined,
  };
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  status: createInitialStatus(),

  updateStatus: (updates) => {
    set((state) => {
      const newStatus = { ...state.status, ...updates };
      notifySubscribers(newStatus);
      return { status: newStatus };
    });
  },

  refreshPendingCount: async (scope) => {
    try {
      const count = await Outbox.countPending(scope);
      get().updateStatus({ pendingOutboxOps: count });
    } catch (error) {
      console.error('Failed to refresh pending count:', error);
    }
  },

  setError: (error) => {
    get().updateStatus({
      lastError: error
        ? {
            code: error.code,
            message: error.message,
            at: Date.now(),
          }
        : undefined,
    });
  },

  clearError: () => {
    get().updateStatus({ lastError: undefined });
  },
}));

/**
 * Subscribe to sync status changes
 * Returns an unsubscribe function
 */
export function subscribeSyncStatus(callback: (status: SyncStatus) => void): () => void {
  statusSubscribers.add(callback);

  // Immediately call with current status
  const currentStatus = useSyncStore.getState().status;
  callback(currentStatus);

  // Return unsubscribe function
  return () => {
    statusSubscribers.delete(callback);
  };
}
