/**
 * KV store interface for small metadata
 * Part of Milestone A: Local DB Foundation
 */

import { getDatabase, safeJsonEncode, safeJsonDecode, nowMs } from './db';

/**
 * Set a key-value pair in the KV store
 * Value is JSON-encoded automatically
 */
export async function setKV<T>(key: string, value: T): Promise<void> {
  const db = getDatabase();
  const jsonValue = safeJsonEncode(value);
  const timestamp = nowMs();

  await db.runAsync(
    `INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)`,
    [key, jsonValue, timestamp]
  );
}

/**
 * Get a value from the KV store
 * Returns null if key doesn't exist
 */
export async function getKV<T>(key: string): Promise<T | null> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM kv WHERE key = ?`,
    [key]
  );

  if (!result) {
    return null;
  }

  return safeJsonDecode<T>(result.value);
}

/**
 * Delete a key from the KV store
 */
export async function deleteKV(key: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(`DELETE FROM kv WHERE key = ?`, [key]);
}

/**
 * Check if a key exists in the KV store
 */
export async function hasKV(key: string): Promise<boolean> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM kv WHERE key = ?`,
    [key]
  );
  return (result?.count ?? 0) > 0;
}

/**
 * Get all keys in the KV store
 */
export async function getAllKeys(): Promise<string[]> {
  const db = getDatabase();
  const results = await db.getAllAsync<{ key: string }>(`SELECT key FROM kv`);
  return results.map((r) => r.key);
}
