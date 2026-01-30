/**
 * SQLite database lifecycle and utilities
 * Part of Milestone A: Local DB Foundation
 */

import * as SQLite from 'expo-sqlite';

export type Database = SQLite.SQLiteDatabase;

let dbInstance: Database | null = null;
let isInitialized = false;
let initError: Error | null = null;
const DB_NAME = 'offline_first.db';

/**
 * Get the current database instance
 * Throws if database is not initialized
 */
export function getDatabase(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return isInitialized && dbInstance !== null;
}

/**
 * Get initialization error if any
 */
export function getInitError(): Error | null {
  return initError;
}

/**
 * Initialize SQLite database
 * Opens database and runs migrations
 */
export async function initializeDatabase(): Promise<void> {
  if (isInitialized && dbInstance) {
    return;
  }

  try {
    // Open database
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);

    // Run migrations
    await runMigrations(dbInstance);

    isInitialized = true;
    initError = null;
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    isInitialized = false;
    dbInstance = null;
    throw initError;
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
    isInitialized = false;
  }
}

/**
 * Reset the local database by deleting it.
 * Intended for dev-mode recovery from fatal init failures.
 */
export async function resetDatabase(): Promise<void> {
  await closeDatabase();
  initError = null;

  const sqlite = SQLite as {
    deleteDatabaseAsync?: (name: string) => Promise<void>;
  };
  if (sqlite.deleteDatabaseAsync) {
    await sqlite.deleteDatabaseAsync(DB_NAME);
  }
}

/**
 * Run migrations based on PRAGMA user_version
 */
async function runMigrations(db: Database): Promise<void> {
  // Get current version
  const versionResult = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionResult?.user_version ?? 0;

  // Run migrations in order
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      try {
        await db.execAsync(migration.sql);
        // Update version after successful migration
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      } catch (error) {
        throw new Error(
          `Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

/**
 * Migration definitions
 * Each migration increments user_version
 */
const migrations: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      -- Skeleton infrastructure tables
      
      -- KV store for small metadata
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      -- Sync cursors per (scope, collection)
      CREATE TABLE IF NOT EXISTS sync_cursors (
        scope_key TEXT NOT NULL,
        collection_key TEXT NOT NULL,
        cursor TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope_key, collection_key)
      );
      
      -- Outbox operations queue
      CREATE TABLE IF NOT EXISTS outbox_ops (
        id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        op_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL,
        last_error_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      -- Indexes for outbox_ops
      CREATE INDEX IF NOT EXISTS idx_outbox_ops_state_created 
        ON outbox_ops(state, created_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_ops_scope_state_created 
        ON outbox_ops(scope_key, state, created_at);
      
      -- Conflicts table (optional but recommended)
      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_version_json TEXT NOT NULL,
        remote_version_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
    `,
  },
  {
    version: 2,
    sql: `
      -- Example entity table (for Milestone C2 testing)
      -- This is a removable example - apps should replace with their own entity tables
      -- DO NOT reference this table in production features
      
      CREATE TABLE IF NOT EXISTS example_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      
      -- Index for querying by updated_at (useful for delta pulls)
      CREATE INDEX IF NOT EXISTS idx_example_items_updated_at 
        ON example_items(updated_at);
    `,
  },
];

/**
 * Execute a function within a transaction
 * Automatically commits or rolls back on error
 * Uses expo-sqlite's built-in transaction support
 * 
 * Note: expo-sqlite's withTransactionAsync expects Promise<void>, so we use
 * a closure variable to capture the return value
 */
export async function withTransaction<T>(
  db: Database,
  fn: () => Promise<T>
): Promise<T> {
  let result: T;
  await db.withTransactionAsync(async () => {
    result = await fn();
  });
  return result!;
}

/**
 * Get current timestamp in milliseconds (epoch)
 */
export function nowMs(): number {
  return Date.now();
}

/**
 * Safe JSON encode (never throws)
 */
export function safeJsonEncode(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    // Fallback for circular references or other issues
    return JSON.stringify({ _error: 'Failed to encode', _type: typeof value });
  }
}

/**
 * Safe JSON decode (returns null on error)
 */
export function safeJsonDecode<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    return null;
  }
}
