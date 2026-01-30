/**
 * Default conflict detector implementation
 * Part of Milestone E: Conflicts + Dev Tooling
 * 
 * Detects conflicts when remote changes arrive for entities with
 * un-synced local changes in the outbox.
 */

import type { Scope } from './types';
import type { DeltaChange } from './adapters';
import type { ConflictDetector } from './applyEngine';
import { Outbox } from './outbox';
import { createConflict, hasConflict } from './conflicts';
import { getDatabase } from './db';
import { safeJsonDecode } from './db';

/**
 * Default conflict detector that checks for pending outbox operations
 * and creates conflict records when conflicts are detected
 */
export class DefaultConflictDetector implements ConflictDetector {
  /**
   * Check if a change should be applied
   * Returns false if there are pending outbox operations for the same entity
   */
  async shouldApplyChange(
    scope: Scope,
    change: DeltaChange,
    _localVersion?: unknown
  ): Promise<boolean> {
    // Only check conflicts for upserts (deletes can proceed)
    if (change.kind !== 'upsert') {
      return true;
    }

    // Check if there are pending outbox operations for this entity
    const hasPending = await Outbox.hasPendingOpsForEntity(
      scope,
      change.entityKey,
      change.entityId
    );

    // If there are pending ops, don't apply (will create conflict)
    return !hasPending;
  }

  /**
   * Called when a conflict is detected
   * Creates a conflict record with local and remote versions
   */
  async onConflictDetected(
    scope: Scope,
    change: DeltaChange,
    _localVersion?: unknown
  ): Promise<void> {
    if (change.kind !== 'upsert') {
      return; // Only handle upsert conflicts
    }

    // Check if conflict already exists (avoid duplicates)
    const conflictExists = await hasConflict(scope, change.entityKey, change.entityId);
    if (conflictExists) {
      return; // Conflict already recorded
    }

    // Get the local version from the database
    // This is a simplified version - apps may want to customize this
    const localVersion = await this.getLocalVersion(change.entityKey, change.entityId);

    // Create conflict record
    await createConflict(
      scope,
      change.entityKey,
      change.entityId,
      localVersion ?? { id: change.entityId }, // Fallback if local version not found
      change.data, // Remote version
      { useTransaction: false }
    );
  }

  /**
   * Get the local version of an entity from the database
   * This is a simplified implementation - apps should override this
   * to fetch from their actual entity tables
   */
  private async getLocalVersion(
    entityKey: string,
    entityId: string
  ): Promise<unknown | null> {
    // For now, try to get from pending outbox ops
    // In a real implementation, apps would query their entity tables
    const db = getDatabase();

    // Try to get the most recent pending op for this entity
    // This gives us the local version that's waiting to sync
    try {
      // Query outbox for pending ops for this entity
      // Note: entity_id is in payload_json, so we use LIKE to search
      const rows = await db.getAllAsync<{ payload_json: string }>(
        `SELECT payload_json FROM outbox_ops
         WHERE entity_key = ?
         AND state IN ('pending', 'in_flight')
         AND payload_json LIKE ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [entityKey, `%"id":"${entityId}"%`]
      );

      if (rows.length > 0) {
        return safeJsonDecode(rows[0].payload_json);
      }
    } catch (error) {
      console.warn('Failed to get local version from outbox:', error);
    }

    // Fallback: try to get from example_items table if that's the entity
    // Apps should customize this for their own tables
    if (entityKey === 'example_items') {
      try {
        const row = await db.getFirstAsync<{ id: string; name: string; updated_at: number; created_at: number }>(
          `SELECT * FROM example_items WHERE id = ?`,
          [entityId]
        );
        return row || null;
      } catch (error) {
        console.warn('Failed to get local version from entity table:', error);
      }
    }

    return null;
  }
}
