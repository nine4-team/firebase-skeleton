/**
 * Conflict management API
 * Part of Milestone E: Conflicts + Dev Tooling
 * 
 * Handles conflict detection, creation, resolution, and querying.
 * Conflicts occur when a remote change arrives for an entity that has
 * un-synced local changes in the outbox.
 */

import { getDatabase, withTransaction, nowMs, safeJsonEncode, safeJsonDecode } from './db';
import type { Scope } from './types';
import { scopeKey } from './types';

/**
 * Conflict representation
 */
export interface Conflict {
  id: string;
  scopeKey: string;
  entityKey: string;
  entityId: string;
  localVersionJson: string; // JSON string of local version
  remoteVersionJson: string; // JSON string of remote version
  createdAt: number;
  resolvedAt: number | null;
}

/**
 * Conflict with parsed versions
 */
export interface ConflictWithVersions extends Omit<Conflict, 'localVersionJson' | 'remoteVersionJson'> {
  localVersion: unknown;
  remoteVersion: unknown;
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Map database row to Conflict object
 */
function mapRowToConflict(row: {
  id: string;
  scope_key: string;
  entity_key: string;
  entity_id: string;
  local_version_json: string;
  remote_version_json: string;
  created_at: number;
  resolved_at: number | null;
}): Conflict {
  return {
    id: row.id,
    scopeKey: row.scope_key,
    entityKey: row.entity_key,
    entityId: row.entity_id,
    localVersionJson: row.local_version_json,
    remoteVersionJson: row.remote_version_json,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Create a conflict record
 * Called when a remote change conflicts with a local un-synced change
 */
export async function createConflict(
  scope: Scope,
  entityKey: string,
  entityId: string,
  localVersion: unknown,
  remoteVersion: unknown,
  options?: { useTransaction?: boolean }
): Promise<string> {
  const db = getDatabase();
  const sk = scopeKey(scope);
  const conflictId = generateUUID();
  const now = nowMs();

  const run = options?.useTransaction === false
    ? async (fn: () => Promise<void>) => {
        await fn();
      }
    : async (fn: () => Promise<void>) => {
        await withTransaction(db, fn);
      };

  await run(async () => {
    // Check if conflict already exists for this entity (unresolved)
    const existing = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM conflicts
       WHERE scope_key = ? AND entity_key = ? AND entity_id = ? AND resolved_at IS NULL`,
      [sk, entityKey, entityId]
    );

    if (existing) {
      // Update existing conflict instead of creating duplicate
      await db.runAsync(
        `UPDATE conflicts
         SET local_version_json = ?, remote_version_json = ?, created_at = ?
         WHERE id = ?`,
        [safeJsonEncode(localVersion), safeJsonEncode(remoteVersion), now, existing.id]
      );
      return existing.id;
    }

    // Create new conflict
    await db.runAsync(
      `INSERT INTO conflicts (
        id, scope_key, entity_key, entity_id,
        local_version_json, remote_version_json,
        created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conflictId,
        sk,
        entityKey,
        entityId,
        safeJsonEncode(localVersion),
        safeJsonEncode(remoteVersion),
        now,
        null,
      ]
    );
  });

  return conflictId;
}

/**
 * Resolve a conflict
 * Marks the conflict as resolved with a timestamp
 */
export async function resolveConflict(conflictId: string): Promise<void> {
  const db = getDatabase();
  const now = nowMs();

  await db.runAsync(
    `UPDATE conflicts SET resolved_at = ? WHERE id = ?`,
    [now, conflictId]
  );
}

/**
 * Resolve all conflicts for a specific entity
 */
export async function resolveConflictsForEntity(
  scope: Scope,
  entityKey: string,
  entityId: string
): Promise<number> {
  const db = getDatabase();
  const sk = scopeKey(scope);
  const now = nowMs();

  const result = await db.runAsync(
    `UPDATE conflicts
     SET resolved_at = ?
     WHERE scope_key = ? AND entity_key = ? AND entity_id = ? AND resolved_at IS NULL`,
    [now, sk, entityKey, entityId]
  );

  return result.changes || 0;
}

/**
 * Get all unresolved conflicts for a scope
 */
export async function getUnresolvedConflicts(scope: Scope): Promise<Conflict[]> {
  const db = getDatabase();
  const sk = scopeKey(scope);

  const rows = await db.getAllAsync<{
    id: string;
    scope_key: string;
    entity_key: string;
    entity_id: string;
    local_version_json: string;
    remote_version_json: string;
    created_at: number;
    resolved_at: number | null;
  }>(
    `SELECT * FROM conflicts
     WHERE scope_key = ? AND resolved_at IS NULL
     ORDER BY created_at DESC`,
    [sk]
  );

  return rows.map(mapRowToConflict);
}

/**
 * Get all conflicts (including resolved) for a scope
 */
export async function getAllConflicts(scope: Scope, limit?: number): Promise<Conflict[]> {
  const db = getDatabase();
  const sk = scopeKey(scope);

  const limitClause = limit ? `LIMIT ${limit}` : '';
  const rows = await db.getAllAsync<{
    id: string;
    scope_key: string;
    entity_key: string;
    entity_id: string;
    local_version_json: string;
    remote_version_json: string;
    created_at: number;
    resolved_at: number | null;
  }>(
    `SELECT * FROM conflicts
     WHERE scope_key = ?
     ORDER BY created_at DESC
     ${limitClause}`,
    [sk]
  );

  return rows.map(mapRowToConflict);
}

/**
 * Get conflicts with parsed versions
 */
export async function getConflictsWithVersions(scope: Scope): Promise<ConflictWithVersions[]> {
  const conflicts = await getUnresolvedConflicts(scope);
  return conflicts.map((conflict) => ({
    ...conflict,
    localVersion: safeJsonDecode(conflict.localVersionJson),
    remoteVersion: safeJsonDecode(conflict.remoteVersionJson),
  }));
}

/**
 * Count unresolved conflicts for a scope
 */
export async function countUnresolvedConflicts(scope: Scope): Promise<number> {
  const db = getDatabase();
  const sk = scopeKey(scope);

  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM conflicts
     WHERE scope_key = ? AND resolved_at IS NULL`,
    [sk]
  );

  return result?.count ?? 0;
}

/**
 * Check if a conflict exists for a specific entity
 */
export async function hasConflict(
  scope: Scope,
  entityKey: string,
  entityId: string
): Promise<boolean> {
  const db = getDatabase();
  const sk = scopeKey(scope);

  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM conflicts
     WHERE scope_key = ? AND entity_key = ? AND entity_id = ? AND resolved_at IS NULL`,
    [sk, entityKey, entityId]
  );

  return (result?.count ?? 0) > 0;
}

/**
 * Delete resolved conflicts older than a certain age (cleanup)
 */
export async function deleteResolvedConflicts(
  scope: Scope,
  olderThanMs: number
): Promise<number> {
  const db = getDatabase();
  const sk = scopeKey(scope);
  const cutoff = nowMs() - olderThanMs;

  const result = await db.runAsync(
    `DELETE FROM conflicts
     WHERE scope_key = ? AND resolved_at IS NOT NULL AND resolved_at < ?`,
    [sk, cutoff]
  );

  return result.changes || 0;
}
