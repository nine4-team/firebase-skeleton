/**
 * Delta pull runner and cursor management
 * Part of Milestone C1: Delta Plumbing
 * Part of Milestone C2: Apply Engine
 */

import { getDatabase, nowMs } from './db';
import { scopeKey, type Scope } from './types';
import type { RemoteDeltaAdapter, DeltaPullResponse } from './adapters';
import { applyChanges, type DeltaChangeHandler, type ConflictDetector } from './applyEngine';

/**
 * Default cursor value for a new (scope, collection) pair
 */
const DEFAULT_CURSOR = '0';

/**
 * Get the current cursor for a (scope, collection) pair
 * Returns DEFAULT_CURSOR if no cursor exists
 */
export async function getCursor(scope: Scope, collectionKey: string): Promise<string> {
  const db = getDatabase();
  const sk = scopeKey(scope);

  const result = await db.getFirstAsync<{ cursor: string }>(
    `SELECT cursor FROM sync_cursors WHERE scope_key = ? AND collection_key = ?`,
    [sk, collectionKey]
  );

  return result?.cursor ?? DEFAULT_CURSOR;
}

/**
 * Set the cursor for a (scope, collection) pair
 */
export async function setCursor(
  scope: Scope,
  collectionKey: string,
  cursor: string
): Promise<void> {
  const db = getDatabase();
  const sk = scopeKey(scope);
  const now = nowMs();

  await db.runAsync(
    `INSERT INTO sync_cursors (scope_key, collection_key, cursor, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope_key, collection_key) 
     DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
    [sk, collectionKey, cursor, now]
  );
}

/**
 * Configuration for delta runner
 */
export interface DeltaRunnerConfig {
  maxPagesPerRun?: number; // Maximum number of pages to pull in a single run
  pageSize?: number; // Not used in C1, but reserved for future use
  conflictDetector?: ConflictDetector; // Optional conflict detector (Milestone E)
}

const DEFAULT_CONFIG: Required<DeltaRunnerConfig> = {
  maxPagesPerRun: 10,
  pageSize: 100,
};

/**
 * Delta runner that pulls changes and updates cursors
 * Part of Milestone C1: Delta Plumbing
 * Part of Milestone C2: Apply Engine
 * 
 * Pulls changes from remote adapter and applies them to SQLite
 * using the provided change handler.
 */
export class DeltaRunner {
  private adapter: RemoteDeltaAdapter;
  private handler: DeltaChangeHandler | null;
  private config: Required<DeltaRunnerConfig> & { conflictDetector?: ConflictDetector };

  constructor(
    adapter: RemoteDeltaAdapter,
    handler?: DeltaChangeHandler,
    config?: DeltaRunnerConfig
  ) {
    this.adapter = adapter;
    this.handler = handler ?? null;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run delta pull for a specific collection
   * Pulls changes in pages until hasMore is false or maxPagesPerRun is reached
   * Applies changes to SQLite and updates cursor after each successful page
   * Part of Milestone C2: Apply Engine
   */
  async runDeltaPull(scope: Scope, collectionKey: string): Promise<{
    pagesPulled: number;
    totalChanges: number;
    applied: number;
    conflicts: number;
    errors: number;
  }> {
    let pagesPulled = 0;
    let totalChanges = 0;
    let totalApplied = 0;
    let totalConflicts = 0;
    let totalErrors = 0;
    let currentCursor = await getCursor(scope, collectionKey);
    let hasMore = true;

    while (hasMore && pagesPulled < this.config.maxPagesPerRun) {
      // Pull changes for this page
      const response: DeltaPullResponse = await this.adapter.pullChanges(
        scope,
        collectionKey,
        currentCursor
      );
      totalChanges += response.changes.length;
      pagesPulled++;

      // Apply changes if handler is provided (Milestone C2)
      if (this.handler && response.changes.length > 0) {
        const result = await applyChanges(response.changes, this.handler, {
          scope,
          conflictDetector: this.config.conflictDetector,
        });
        totalApplied += result.applied;
        totalConflicts += result.conflicts;
        totalErrors += result.errors.length;

        // Log conflicts if any (Milestone E)
        if (result.conflicts > 0) {
          console.info(
            `[DeltaRunner] Detected ${result.conflicts} conflict(s) for ${collectionKey}`
          );
        }

        // If any change fails, the batch is rolled back and we stop without
        // advancing the cursor, to avoid losing unapplied changes.
        if (result.errors.length > 0) {
          console.warn(
            `[DeltaRunner] Failed to apply ${result.errors.length} changes for ${collectionKey}:`,
            result.errors.map((e) => e.error.message)
          );
          break;
        }
      }

      // Update cursor after successful pull (and apply, if configured)
      // This ensures we don't re-process the same changes
      await setCursor(scope, collectionKey, response.nextCursor);

      currentCursor = response.nextCursor;
      hasMore = response.hasMore ?? false;

      // If no changes and no more pages, we're done
      if (response.changes.length === 0 && !hasMore) {
        break;
      }
    }

    return { pagesPulled, totalChanges, applied: totalApplied, conflicts: totalConflicts, errors: totalErrors };
  }

  /**
   * Run delta pull for multiple collections
   */
  async runDeltaPullForCollections(
    scope: Scope,
    collectionKeys: string[]
  ): Promise<{
    [collectionKey: string]: {
      pagesPulled: number;
      totalChanges: number;
      applied: number;
      conflicts: number;
      errors: number;
    };
  }> {
    const results: {
      [collectionKey: string]: {
        pagesPulled: number;
        totalChanges: number;
        applied: number;
        conflicts: number;
        errors: number;
      };
    } = {};

    for (const collectionKey of collectionKeys) {
      results[collectionKey] = await this.runDeltaPull(scope, collectionKey);
    }

    return results;
  }
}
