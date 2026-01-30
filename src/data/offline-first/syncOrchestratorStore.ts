/**
 * Sync orchestrator store/hook
 * Part of Milestone D: Signal + Lifecycle
 * 
 * Manages the global SyncOrchestrator instance and provides a React hook to access it.
 * Apps should initialize the orchestrator once at app startup.
 */

import { useEffect, useState } from 'react';
import { SyncOrchestrator, type SyncOrchestratorConfig } from './syncOrchestrator';
import type { RemoteOutboxAdapter, RemoteDeltaAdapter, RemoteSignalAdapter } from './adapters';
import type { Scope } from './types';

let globalOrchestrator: SyncOrchestrator | null = null;
const orchestratorSubscribers = new Set<(orchestrator: SyncOrchestrator | null) => void>();

function notifyOrchestratorSubscribers(orchestrator: SyncOrchestrator | null): void {
  orchestratorSubscribers.forEach((cb) => {
    try {
      cb(orchestrator);
    } catch (error) {
      console.error('Error in orchestrator subscriber:', error);
    }
  });
}

/**
 * Initialize the global sync orchestrator
 * Should be called once at app startup
 */
export function initializeSyncOrchestrator(
  outboxAdapter: RemoteOutboxAdapter,
  deltaAdapter?: RemoteDeltaAdapter,
  signalAdapter?: RemoteSignalAdapter,
  config?: SyncOrchestratorConfig
): SyncOrchestrator {
  if (globalOrchestrator) {
    console.warn('SyncOrchestrator already initialized. Returning existing instance.');
    return globalOrchestrator;
  }

  globalOrchestrator = new SyncOrchestrator(outboxAdapter, deltaAdapter, signalAdapter, config);
  notifyOrchestratorSubscribers(globalOrchestrator);
  return globalOrchestrator;
}

/**
 * Get the global sync orchestrator instance
 */
export function getSyncOrchestrator(): SyncOrchestrator | null {
  return globalOrchestrator;
}

/**
 * Reset the global sync orchestrator (useful for testing or reset)
 */
export function resetSyncOrchestrator(): void {
  if (globalOrchestrator) {
    globalOrchestrator.stop().catch(console.error);
    globalOrchestrator = null;
    notifyOrchestratorSubscribers(null);
  }
}

/**
 * React hook to access the sync orchestrator
 * Automatically starts/stops the orchestrator and manages scope sync
 */
export function useSyncOrchestrator(scope?: Scope) {
  const [orchestrator, setOrchestrator] = useState<SyncOrchestrator | null>(() => globalOrchestrator);

  useEffect(() => {
    setOrchestrator(globalOrchestrator);
    const handleOrchestratorChange = (nextOrchestrator: SyncOrchestrator | null) => {
      setOrchestrator(nextOrchestrator);
    };
    orchestratorSubscribers.add(handleOrchestratorChange);
    return () => {
      orchestratorSubscribers.delete(handleOrchestratorChange);
    };
  }, []);

  useEffect(() => {
    if (!orchestrator) {
      return;
    }

    // Start orchestrator if not already started
    orchestrator.start().catch(console.error);

    return () => {
      orchestrator.stop().catch(console.error);
    };
  }, [orchestrator]);

  useEffect(() => {
    if (!orchestrator || !scope) {
      return;
    }

    // Start scope sync if scope is provided
    orchestrator.startScopeSync(scope).catch(console.error);

    return () => {
      orchestrator.stopScopeSync().catch(console.error);
    };
  }, [orchestrator, scope]);

  return orchestrator;
}
