/**
 * Outbox processor that handles batch processing of outbox operations
 * Part of Milestone B: Outbox MVP
 */

import { Outbox, type OutboxOp } from './outbox';
import type { RemoteOutboxAdapter, OutboxPushResult } from './adapters';
import type { Scope } from './types';
import { safeJsonDecode } from './db';

export interface OutboxProcessorConfig {
  batchSize: number;
  maxAttempts: number;
  backoffMs: number; // Base backoff delay
  maxBackoffMs: number; // Maximum backoff delay
}

const DEFAULT_CONFIG: OutboxProcessorConfig = {
  batchSize: 10,
  maxAttempts: 5,
  backoffMs: 1000, // 1 second
  maxBackoffMs: 60000, // 1 minute
};

/**
 * Calculate backoff delay based on attempt count
 * Uses exponential backoff with jitter
 */
function calculateBackoff(attemptCount: number, baseMs: number, maxMs: number): number {
  const exponentialDelay = Math.min(baseMs * Math.pow(2, attemptCount), maxMs);
  // Add jitter (±20%) to prevent thundering herd
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, exponentialDelay + jitter);
}

/**
 * Check if an operation's backoff delay has elapsed
 */
function isBackoffElapsed(op: OutboxOp, config: OutboxProcessorConfig): boolean {
  // If this is the first attempt, retry immediately
  if (op.attemptCount === 0) {
    return true;
  }

  const backoffDelay = calculateBackoff(op.attemptCount - 1, config.backoffMs, config.maxBackoffMs);
  const timeSinceUpdate = Date.now() - op.updatedAt;
  return timeSinceUpdate >= backoffDelay;
}

/**
 * Outbox processor that handles pushing operations to remote
 */
export class OutboxProcessor {
  private config: OutboxProcessorConfig;
  private adapter: RemoteOutboxAdapter;
  private isProcessing = false;
  private processingScope: Scope | null = null;

  constructor(adapter: RemoteOutboxAdapter, config?: Partial<OutboxProcessorConfig>) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a batch of outbox operations
   * Returns the number of operations processed
   */
  async processBatch(scope: Scope): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    this.processingScope = scope;

    try {
      await Outbox.resetStaleInFlight(scope);
      const pendingOps = await Outbox.getPending(scope, this.config.batchSize * 5);

      if (pendingOps.length === 0) {
        return 0;
      }

      const exhaustedOps = pendingOps.filter((op) => op.attemptCount >= this.config.maxAttempts);
      for (const op of exhaustedOps) {
        await Outbox.updateState(op.id, 'failed', {
          code: 'max_attempts',
          message: 'Max retry attempts reached',
        });
      }

      const retryCandidates = pendingOps.filter((op) => op.attemptCount < this.config.maxAttempts);
      const readyOps = retryCandidates.filter((op) => isBackoffElapsed(op, this.config)).slice(0, this.config.batchSize);

      if (readyOps.length === 0) {
        return 0;
      }

      await Outbox.claimByIds(readyOps.map((op) => op.id));

      // Convert to adapter format
      const adapterOps = readyOps.map((op) => ({
        id: op.id,
        entityKey: op.entityKey,
        opType: op.opType,
        payload: safeJsonDecode(op.payloadJson),
        idempotencyKey: op.idempotencyKey,
      }));

      // Push to remote
      const results = await this.adapter.pushOps(scope, adapterOps);
      const resultsById = new Map(results.map((result) => [result.opId, result]));

      let processedCount = 0;
      for (const op of readyOps) {
        const result = resultsById.get(op.id);
        if (!result) {
          console.warn('Outbox adapter returned no result for op', op.id);
          await Outbox.markForRetry(op.id);
          await Outbox.updateState(op.id, 'pending', {
            code: 'missing_result',
            message: 'Adapter did not return a result for this operation',
          });
          continue;
        }

        if (result.status === 'succeeded') {
          await Outbox.updateState(op.id, 'succeeded');
          processedCount++;
        } else if (result.status === 'failed') {
          if (result.retryable && op.attemptCount + 1 < this.config.maxAttempts) {
            // Mark for retry with backoff
            await Outbox.markForRetry(op.id);
            await Outbox.updateState(op.id, 'pending', result.error);
          } else {
            // Max attempts reached or non-retryable
            await Outbox.updateState(op.id, 'failed', result.error);
            console.warn('Outbox op failed', op.id, result.error);
          }
        } else if (result.status === 'blocked') {
          await Outbox.updateState(op.id, 'blocked', {
            code: 'blocked',
            message: result.reason,
          });
          console.warn('Outbox op blocked', op.id, result.reason);
        }
      }

      return processedCount;
    } finally {
      this.isProcessing = false;
      this.processingScope = null;
    }
  }

  /**
   * Check if processor is currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Get the scope currently being processed
   */
  getProcessingScope(): Scope | null {
    return this.processingScope;
  }
}
