/**
 * Sync status indicator component
 * Part of Milestone D: Signal + Lifecycle
 * 
 * Shows sync status, pending outbox ops count, and last error summary.
 * Non-blocking indicator that can be tapped for details in dev mode.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppText } from './AppText';
import { useTheme, useUIKitTheme } from '../theme/ThemeProvider';
import type { SyncStatus } from '../data/offline-first/types';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  onPress?: () => void; // Optional: tap to show details (dev mode)
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ status, onPress }) => {
  const theme = useTheme();
  const uiKitTheme = useUIKitTheme();

  const hasPendingOps = status.pendingOutboxOps > 0;
  const hasError = status.lastError !== undefined;
  const isSyncing = status.isSyncing;

  // Don't show anything if everything is clean
  if (!hasPendingOps && !hasError && !isSyncing) {
    return null;
  }

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: hasError
            ? uiKitTheme.surface.error || '#FF3B30'
            : uiKitTheme.surface.secondary || '#F2F2F7',
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.sm,
        },
      ]}
    >
      <View style={styles.content}>
        {isSyncing && (
          <ActivityIndicator
            size="small"
            color={hasError ? '#FFFFFF' : uiKitTheme.text.secondary}
            style={styles.spinner}
          />
        )}
        <AppText
          variant="caption"
          style={[
            styles.text,
            {
              color: hasError ? '#FFFFFF' : uiKitTheme.text.secondary,
            },
          ]}
        >
          {isSyncing && 'Syncing...'}
          {!isSyncing && hasPendingOps && `${status.pendingOutboxOps} pending`}
          {!isSyncing && !hasPendingOps && hasError && 'Sync error'}
        </AppText>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: 8,
  },
  text: {
    textAlign: 'center',
  },
});
