/**
 * Sync status bar component
 * Part of Milestone D: Signal + Lifecycle
 * Part of Milestone E: Conflicts + Dev Tooling
 * 
 * Combines OfflineBanner, SyncStatusIndicator, and ConflictIndicator into a single bar
 * that appears at the top of the app when there's sync activity, offline state, or conflicts.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { OfflineBanner } from './OfflineBanner';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { ConflictIndicator } from './ConflictIndicator';
import { useSyncStore, subscribeSyncStatus } from '../data/offline-first';
import type { SyncStatus, Scope } from '../data/offline-first/types';

interface SyncStatusBarProps {
  scope?: Scope; // Active scope for conflict detection
  onStatusPress?: () => void; // Optional: tap sync status for details (dev mode)
  onConflictPress?: () => void; // Optional: tap conflict indicator to navigate to conflict screen
}

export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({ 
  scope = { type: 'global' },
  onStatusPress,
  onConflictPress,
}) => {
  const [status, setStatus] = useState<SyncStatus>(useSyncStore.getState().status);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((newStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, []);

  // Only show if offline, there's sync activity, or conflicts exist
  // (conflict indicator handles its own visibility)
  const hasSyncActivity = !status.isOnline || status.isSyncing || status.pendingOutboxOps > 0 || status.lastError;

  if (!hasSyncActivity) {
    // Still show conflict indicator if conflicts exist
    return (
      <View style={styles.container}>
        <ConflictIndicator scope={scope} onPress={onConflictPress} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!status.isOnline && <OfflineBanner isOnline={status.isOnline} />}
      {(status.isSyncing || status.pendingOutboxOps > 0 || status.lastError) && (
        <SyncStatusIndicator status={status} onPress={onStatusPress} />
      )}
      <ConflictIndicator scope={scope} onPress={onConflictPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
