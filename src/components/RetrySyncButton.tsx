/**
 * Retry sync button component
 * Part of Milestone D: Signal + Lifecycle
 * 
 * Button to manually trigger a foreground sync.
 * Useful when sync fails or user wants to force a refresh.
 */

import React from 'react';
import { AppButton } from './AppButton';
import type { SyncStatus } from '../data/offline-first/types';

interface RetrySyncButtonProps {
  status: SyncStatus;
  onRetry: () => void | Promise<void>;
  variant?: 'primary' | 'secondary';
}

export const RetrySyncButton: React.FC<RetrySyncButtonProps> = ({
  status,
  onRetry,
  variant = 'secondary',
}) => {
  const isLoading = status.isSyncing;
  const hasError = status.lastError !== undefined;
  const hasPendingOps = status.pendingOutboxOps > 0;

  // Only show button if there's something to retry
  if (!hasError && !hasPendingOps && !isLoading) {
    return null;
  }

  const getButtonText = () => {
    if (isLoading) {
      return 'Syncing...';
    }
    if (hasError) {
      return 'Retry Sync';
    }
    if (hasPendingOps) {
      return `Sync ${status.pendingOutboxOps} ${status.pendingOutboxOps === 1 ? 'change' : 'changes'}`;
    }
    return 'Sync';
  };

  return (
    <AppButton
      title={getButtonText()}
      variant={variant}
      loading={isLoading}
      onPress={onRetry}
      disabled={isLoading}
    />
  );
};
