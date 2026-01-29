# Offline-First Data Layer (Optional)

The template provides a `Repository<T>` interface that allows apps to choose between **online-first** (default) and **offline-first** implementations.

## Current Status

- ✅ **Online-first implementation**: `FirestoreRepository` - direct Firestore access
- ⏳ **Offline-first implementation**: Not yet implemented (placeholder)

## Future Implementation

When implementing offline-first mode, the pattern should follow:

1. **Local Database**: SQLite (using `expo-sqlite` or `react-native-sqlite-storage`)
2. **Outbox Queue**: Track mutations that need to sync
3. **Sync Engine**: Batch push/pull changes with conflict resolution
4. **Cost-Aware**: Use incremental pulls (`updatedAt > cursor`) instead of always-on listeners

## Reference Patterns

- `ledger`: outbox queue + scheduler/backoff + conflict hooks
- `memories`: simpler "queued mutations" pattern

## Usage

```typescript
import { createRepository } from '@/data/repository';

// Online-first (default)
const repo = createRepository<MyEntity>('users/{uid}/objects', 'online');

// Offline-first (when implemented)
const repo = createRepository<MyEntity>('users/{uid}/objects', 'offline');
```
