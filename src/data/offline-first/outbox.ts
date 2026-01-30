/**
 * Outbox operations queue
 * Part of Milestone B: Outbox MVP
 */

import { getDatabase, withTransaction, nowMs, safeJsonEncode } from './db';
import type { Scope } from './types';
import { scopeKey } from './types';

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID if available, otherwise falls back to a simple implementation
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type OutboxOpType = 'upsert' | 'delete' | 'custom';
export type OutboxOpState = 'pending' | 'in_flight' | 'succeeded' | 'failed' | 'blocked';

export interface OutboxOp {
  id: string;
  scopeKey: string;
  entityKey: string;
  opType: OutboxOpType;
  idempotencyKey: string;
  payloadJson: string;
  attemptCount: number;
  state: OutboxOpState;
  lastErrorJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface EnqueueOptions {
  scope: Scope;
  entityKey: string;
  opType: OutboxOpType;
  payload: unknown;
  idempotencyKey?: string; // If not provided, will be generated
}

/**
 * Outbox operations manager
 */
export class Outbox {
  static mapRowToOp(row: {
    id: string;
    scope_key: string;
    entity_key: string;
    op_type: string;
    idempotency_key: string;
    payload_json: string;
    attempt_count: number;
    state: string;
    last_error_json: string | null;
    created_at: number;
    updated_at: number;
  }): OutboxOp {
    return {
      id: row.id,
      scopeKey: row.scope_key,
      entityKey: row.entity_key,
      opType: row.op_type as OutboxOpType,
      idempotencyKey: row.idempotency_key,
      payloadJson: row.payload_json,
      attemptCount: row.attempt_count,
      state: row.state as OutboxOpState,
      lastErrorJson: row.last_error_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Enqueue a new operation to the outbox
   */
  static async enqueue(options: EnqueueOptions): Promise<string> {
    const db = getDatabase();
    const opId = generateUUID();
    const idempotencyKey = options.idempotencyKey || `${options.entityKey}:${options.opType}:${generateUUID()}`;
    const scopeKeyStr = scopeKey(options.scope);
    const now = nowMs();

    await withTransaction(db, async () => {
      await db.runAsync(
        `INSERT INTO outbox_ops (
          id, scope_key, entity_key, op_type, idempotency_key,
          payload_json, attempt_count, state, last_error_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          opId,
          scopeKeyStr,
          options.entityKey,
          options.opType,
          idempotencyKey,
          safeJsonEncode(options.payload),
          0,
          'pending',
          null,
          now,
          now,
        ]
      );
    });

    return opId;
  }

  /**
   * Reset in-flight ops that have been stuck too long (stale claims)
   */
  static async resetStaleInFlight(scope: Scope, staleMs = 5 * 60 * 1000): Promise<number> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);
    const now = nowMs();

    const staleThreshold = now - staleMs;
    const result = await db.runAsync(
      `UPDATE outbox_ops 
       SET state = 'pending', updated_at = ?
       WHERE scope_key = ? AND state = 'in_flight' AND updated_at < ?`,
      [now, scopeKeyStr, staleThreshold]
    );
    return result.changes || 0;
  }

  /**
   * Get pending operations (does not change state)
   */
  static async getPending(scope: Scope, limit: number): Promise<OutboxOp[]> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);

    const rows = await db.getAllAsync<{
      id: string;
      scope_key: string;
      entity_key: string;
      op_type: string;
      idempotency_key: string;
      payload_json: string;
      attempt_count: number;
      state: string;
      last_error_json: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM outbox_ops
       WHERE scope_key = ? AND state = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`,
      [scopeKeyStr, limit]
    );

    return rows.map(Outbox.mapRowToOp);
  }

  /**
   * Claim operations for processing by marking them as in_flight
   */
  static async claimByIds(opIds: string[]): Promise<void> {
    if (opIds.length === 0) {
      return;
    }

    const db = getDatabase();
    const now = nowMs();
    const placeholders = opIds.map(() => '?').join(', ');

    await db.runAsync(
      `UPDATE outbox_ops 
       SET state = 'in_flight', updated_at = ?
       WHERE id IN (${placeholders}) AND state = 'pending'`,
      [now, ...opIds]
    );
  }

  /**
   * Get operations by ID
   */
  static async getByIds(opIds: string[]): Promise<OutboxOp[]> {
    if (opIds.length === 0) {
      return [];
    }

    const db = getDatabase();
    const placeholders = opIds.map(() => '?').join(', ');
    const rows = await db.getAllAsync<{
      id: string;
      scope_key: string;
      entity_key: string;
      op_type: string;
      idempotency_key: string;
      payload_json: string;
      attempt_count: number;
      state: string;
      last_error_json: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM outbox_ops
       WHERE id IN (${placeholders})`,
      opIds
    );

    return rows.map(Outbox.mapRowToOp);
  }

  /**
   * Get pending operations for processing
   * Claims up to `limit` operations by marking them as `in_flight`
   */
  static async claimPending(scope: Scope, limit: number): Promise<OutboxOp[]> {
    await Outbox.resetStaleInFlight(scope);
    const pending = await Outbox.getPending(scope, limit);
    const opIds = pending.map((op) => op.id);
    await Outbox.claimByIds(opIds);
    return Outbox.getByIds(opIds);
  }

  /**
   * Update operation state
   */
  static async updateState(
    opId: string,
    state: OutboxOpState,
    error?: { code: string; message: string }
  ): Promise<void> {
    const db = getDatabase();
    const now = nowMs();

    await db.runAsync(
      `UPDATE outbox_ops 
       SET state = ?, last_error_json = ?, updated_at = ?
       WHERE id = ?`,
      [state, error ? safeJsonEncode(error) : null, now, opId]
    );
  }

  /**
   * Increment attempt count and reset to pending (for retry)
   */
  static async markForRetry(opId: string): Promise<void> {
    const db = getDatabase();
    const now = nowMs();

    await db.runAsync(
      `UPDATE outbox_ops 
       SET state = 'pending', attempt_count = attempt_count + 1, updated_at = ?
       WHERE id = ?`,
      [now, opId]
    );
  }

  /**
   * Delete succeeded operations (cleanup)
   */
  static async deleteSucceeded(scope: Scope, olderThanMs?: number): Promise<number> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);

    if (olderThanMs) {
      const cutoff = nowMs() - olderThanMs;
      const result = await db.runAsync(
        `DELETE FROM outbox_ops 
         WHERE scope_key = ? AND state = 'succeeded' AND updated_at < ?`,
        [scopeKeyStr, cutoff]
      );
      return result.changes || 0;
    } else {
      const result = await db.runAsync(
        `DELETE FROM outbox_ops 
         WHERE scope_key = ? AND state = 'succeeded'`,
        [scopeKeyStr]
      );
      return result.changes || 0;
    }
  }

  /**
   * Count pending operations
   */
  static async countPending(scope: Scope): Promise<number> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);

    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM outbox_ops
       WHERE scope_key = ? AND state = 'pending'`,
      [scopeKeyStr]
    );

    return result?.count ?? 0;
  }

  /**
   * Count all operations by state
   */
  static async countByState(scope: Scope, state: OutboxOpState): Promise<number> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);

    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM outbox_ops
       WHERE scope_key = ? AND state = ?`,
      [scopeKeyStr, state]
    );

    return result?.count ?? 0;
  }

  /**
   * Get recent operations for debugging (all states)
   */
  static async getRecentOps(scope: Scope, limit: number): Promise<OutboxOp[]> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);

    const rows = await db.getAllAsync<{
      id: string;
      scope_key: string;
      entity_key: string;
      op_type: string;
      idempotency_key: string;
      payload_json: string;
      attempt_count: number;
      state: string;
      last_error_json: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM outbox_ops
       WHERE scope_key = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [scopeKeyStr, limit]
    );

    return rows.map(Outbox.mapRowToOp);
  }

  /**
   * Check if there are pending operations for a specific entity
   * Used for conflict detection (Milestone E)
   */
  static async hasPendingOpsForEntity(
    scope: Scope,
    entityKey: string,
    entityId: string
  ): Promise<boolean> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);

    // Check if there are any pending/in_flight ops for this entity
    // We parse the payload_json to check the entity id
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM outbox_ops
       WHERE scope_key = ? AND entity_key = ? 
       AND state IN ('pending', 'in_flight')
       AND payload_json LIKE ?`,
      [scopeKeyStr, entityKey, `%"id":"${entityId}"%`]
    );

    return (result?.count ?? 0) > 0;
  }

  /**
   * Get pending operations for a specific entity
   * Used for conflict detection (Milestone E)
   */
  static async getPendingOpsForEntity(
    scope: Scope,
    entityKey: string,
    entityId: string
  ): Promise<OutboxOp[]> {
    const db = getDatabase();
    const scopeKeyStr = scopeKey(scope);

    const rows = await db.getAllAsync<{
      id: string;
      scope_key: string;
      entity_key: string;
      op_type: string;
      idempotency_key: string;
      payload_json: string;
      attempt_count: number;
      state: string;
      last_error_json: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM outbox_ops
       WHERE scope_key = ? AND entity_key = ?
       AND state IN ('pending', 'in_flight')
       AND payload_json LIKE ?
       ORDER BY created_at ASC`,
      [scopeKeyStr, entityKey, `%"id":"${entityId}"%`]
    );

    return rows.map(Outbox.mapRowToOp);
  }
}
