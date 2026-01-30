/**
 * Type definitions for offline-first implementation
 */

/**
 * Scope represents an optional active context (e.g. "workspace", "project", "account")
 * Skeleton supports one active scope at a time, but does not define what scopes mean
 */
export type Scope =
  | { type: 'global' }
  | { type: string; id?: string };

/**
 * Sync status information
 */
export type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOutboxOps: number;
  lastSyncAt?: number; // epoch ms
  lastError?: { code: string; message: string; at: number };
};

/**
 * Scope key string representation
 * Used for database storage
 */
export function scopeKey(scope: Scope): string {
  if (scope.type === 'global') {
    return 'global';
  }
  // TypeScript narrowing: if type is not 'global', it must be { type: string; id?: string }
  const typedScope = scope as { type: string; id?: string };
  return typedScope.id ? `${typedScope.type}:${typedScope.id}` : typedScope.type;
}
