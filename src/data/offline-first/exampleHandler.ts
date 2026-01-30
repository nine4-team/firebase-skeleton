/**
 * Example delta change handler
 * Part of Milestone C2: Apply Engine
 * 
 * This is a REMOVABLE example implementation used only to prove end-to-end wiring.
 * Apps should replace this with their own handlers for their entity tables.
 * 
 * DO NOT reference this handler in production features.
 */

import { getDatabase } from './db';
import type { DeltaChangeHandler } from './applyEngine';

/**
 * Example entity data structure
 * This matches the example_items table schema
 */
export interface ExampleItem {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
}

/**
 * Example handler that applies changes to the example_items table
 * Demonstrates idempotent upsert and delete operations
 */
export class ExampleDeltaHandler implements DeltaChangeHandler {
  /**
   * Apply upsert to example_items table
   * Uses INSERT OR REPLACE for idempotency (LWW by updated_at)
   */
  async applyUpsert(
    entityKey: string,
    entityId: string,
    data: unknown,
    updatedAt: number
  ): Promise<void> {
    // Only handle example_items entity
    if (entityKey !== 'example_items') {
      return; // Silently ignore other entity types
    }

    const db = getDatabase();

    // Parse data - expect ExampleItem structure
    const itemData = data as Partial<ExampleItem>;
    const name = itemData.name ?? 'Unnamed Item';
    const createdAt = itemData.createdAt ?? updatedAt;

    // Idempotent upsert: INSERT OR REPLACE ensures no duplicates
    // If updatedAt is provided in data and is newer, use it; otherwise use the change's updatedAt
    const finalUpdatedAt = itemData.updatedAt && itemData.updatedAt > updatedAt
      ? itemData.updatedAt
      : updatedAt;

    await db.runAsync(
      `INSERT OR REPLACE INTO example_items (id, name, updated_at, created_at)
       VALUES (?, ?, ?, ?)`,
      [entityId, name, finalUpdatedAt, createdAt]
    );
  }

  /**
   * Apply delete to example_items table
   * Idempotent: deleting a non-existent row is a no-op
   */
  async applyDelete(
    entityKey: string,
    entityId: string,
    _updatedAt: number
  ): Promise<void> {
    // Only handle example_items entity
    if (entityKey !== 'example_items') {
      return; // Silently ignore other entity types
    }

    const db = getDatabase();

    // Idempotent delete: DELETE WHERE id = ? is safe to run multiple times
    await db.runAsync(
      `DELETE FROM example_items WHERE id = ?`,
      [entityId]
    );
  }
}

/**
 * Composite handler that delegates to multiple handlers
 * Useful when apps have multiple entity types
 */
export class CompositeDeltaHandler implements DeltaChangeHandler {
  private handlers: Map<string, DeltaChangeHandler>;

  constructor(handlers: Array<{ entityKey: string; handler: DeltaChangeHandler }>) {
    this.handlers = new Map();
    for (const { entityKey, handler } of handlers) {
      this.handlers.set(entityKey, handler);
    }
  }

  async applyUpsert(
    entityKey: string,
    entityId: string,
    data: unknown,
    updatedAt: number
  ): Promise<void> {
    const handler = this.handlers.get(entityKey);
    if (handler) {
      await handler.applyUpsert(entityKey, entityId, data, updatedAt);
    }
    // Silently ignore unknown entity keys (allows partial handlers)
  }

  async applyDelete(
    entityKey: string,
    entityId: string,
    updatedAt: number
  ): Promise<void> {
    const handler = this.handlers.get(entityKey);
    if (handler) {
      await handler.applyDelete(entityKey, entityId, updatedAt);
    }
    // Silently ignore unknown entity keys (allows partial handlers)
  }
}
