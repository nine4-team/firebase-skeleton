/**
 * Apply engine for delta changes
 * Part of Milestone C2: Apply Engine
 * Part of Milestone E: Conflicts + Dev Tooling
 * 
 * Applies delta changes (upserts/deletes) to SQLite entity tables
 * within a transaction, ensuring idempotency.
 * Supports conflict detection when remote changes arrive for entities
 * with un-synced local changes.
 */

import { getDatabase, withTransaction } from './db';
import type { DeltaChange } from './adapters';
import type { Scope } from './types';

/**
 * Handler interface that apps must implement
 * to apply changes to their entity tables
 */
export interface DeltaChangeHandler {
  /**
   * Apply an upsert operation to an entity table
   * Must be idempotent: applying the same change multiple times
   * should result in the same final state
   * 
   * @param entityKey - Stable identifier for the entity type (e.g. 'tasks', 'notes')
   * @param entityId - Unique identifier for the entity instance
   * @param data - The entity data (parsed from JSON)
   * @param updatedAt - Timestamp from the delta change (epoch ms)
   */
  applyUpsert(
    entityKey: string,
    entityId: string,
    data: unknown,
    updatedAt: number
  ): Promise<void>;

  /**
   * Apply a delete operation to an entity table
   * Must be idempotent: deleting a non-existent entity should be a no-op
   * 
   * @param entityKey - Stable identifier for the entity type
   * @param entityId - Unique identifier for the entity instance
   * @param updatedAt - Timestamp from the delta change (epoch ms)
   */
  applyDelete(
    entityKey: string,
    entityId: string,
    updatedAt: number
  ): Promise<void>;
}

/**
 * Apply a single delta change using the provided handler
 * Runs within a transaction to ensure atomicity
 */
async function applyChangeInternal(
  change: DeltaChange,
  handler: DeltaChangeHandler
): Promise<void> {
  if (change.kind === 'upsert') {
    await handler.applyUpsert(
      change.entityKey,
      change.entityId,
      change.data,
      change.updatedAt
    );
  } else if (change.kind === 'delete') {
    await handler.applyDelete(
      change.entityKey,
      change.entityId,
      change.updatedAt
    );
  }
}

export async function applyChange(
  change: DeltaChange,
  handler: DeltaChangeHandler
): Promise<void> {
  const db = getDatabase();
  await withTransaction(db, async () => {
    await applyChangeInternal(change, handler);
  });
}

/**
 * Conflict detection callback
 * Called when a remote change conflicts with a local un-synced change
 * Part of Milestone E: Conflicts + Dev Tooling
 */
export interface ConflictDetector {
  /**
   * Check if a change should be applied or if it conflicts with local changes
   * @param scope - The active scope
   * @param change - The delta change to check
   * @param localVersion - The current local version (if available)
   * @returns true if the change should be applied, false if it conflicts
   */
  shouldApplyChange(
    scope: Scope,
    change: DeltaChange,
    localVersion?: unknown
  ): Promise<boolean>;

  /**
   * Called when a conflict is detected
   * @param scope - The active scope
   * @param change - The conflicting change
   * @param localVersion - The local version that conflicts
   */
  onConflictDetected(
    scope: Scope,
    change: DeltaChange,
    localVersion?: unknown
  ): Promise<void>;
}

/**
 * Apply multiple delta changes in a single transaction
 * Ensures all-or-nothing semantics
 * Part of Milestone E: Supports conflict detection via optional ConflictDetector
 */
export async function applyChanges(
  changes: DeltaChange[],
  handler: DeltaChangeHandler,
  options?: {
    scope?: Scope;
    conflictDetector?: ConflictDetector;
  }
): Promise<{
  applied: number;
  conflicts: number;
  errors: Array<{ change: DeltaChange; error: Error }>;
}> {
  const db = getDatabase();
  const errors: Array<{ change: DeltaChange; error: Error }> = [];
  let applied = 0;
  let conflicts = 0;

  // Apply all changes in a single transaction. If any change fails,
  // the entire batch is rolled back to preserve atomicity.
  try {
    await withTransaction(db, async () => {
      for (const change of changes) {
        try {
          // Check for conflicts if detector is provided (Milestone E)
          if (options?.conflictDetector && options?.scope && change.kind === 'upsert') {
            // For upserts, check if we should apply the change
            const shouldApply = await options.conflictDetector.shouldApplyChange(
              options.scope,
              change
            );

            if (!shouldApply) {
              // Conflict detected - call the handler
              // We need to get the local version to pass to onConflictDetected
              // For now, we'll pass the change data as local version placeholder
              // Apps can override this behavior in their ConflictDetector implementation
              await options.conflictDetector.onConflictDetected(
                options.scope,
                change
              );
              conflicts++;
              continue; // Skip applying this change
            }
          }

          await applyChangeInternal(change, handler);
          applied++;
        } catch (error) {
          errors.push({
            change,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }

      if (errors.length > 0) {
        throw new Error(
          `applyChanges failed with ${errors.length} error(s); batch rolled back.`
        );
      }
    });
  } catch (error) {
    if (errors.length === 0) {
      throw error;
    }
    return { applied: 0, conflicts, errors };
  }

  return { applied, conflicts, errors };
}
