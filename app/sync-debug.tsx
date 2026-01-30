/**
 * Sync Debug Screen (Dev Only)
 * Part of Milestone E: Conflicts + Dev Tooling
 * 
 * Dev-only screen to inspect:
 * - Outbox ops + states
 * - Cursors
 * - Last sync error
 * - Conflicts
 * - Force "signal" and "foreground sync"
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { Screen } from '../src/components/Screen';
import { AppText } from '../src/components/AppText';
import { AppButton } from '../src/components/AppButton';
import { useTheme, useUIKitTheme } from '../src/theme/ThemeProvider';
import { getCardStyle, getTextSecondaryStyle, layout, surface, textEmphasis } from '../src/ui';
import { Outbox, type OutboxOp } from '../src/data/offline-first/outbox';
import { getCursor } from '../src/data/offline-first/deltaRunner';
import { getAllConflicts, resolveConflict } from '../src/data/offline-first/conflicts';
import { getSyncOrchestrator } from '../src/data/offline-first/syncOrchestratorStore';
import { useSyncStore } from '../src/data/offline-first';
import type { Scope } from '../src/data/offline-first/types';
import { safeJsonDecode } from '../src/data/offline-first/db';
import { getStubAdapters } from '../src/data/offline-first/stubAdapters';

const DEFAULT_SCOPE: Scope = { type: 'global' };

function formatTimestamp(ms: number | undefined): string {
  if (!ms) return 'Never';
  const date = new Date(ms);
  return date.toLocaleTimeString();
}

function formatDate(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleString();
}

export default function SyncDebugScreen() {
  const theme = useTheme();
  const uiKitTheme = useUIKitTheme();
  const status = useSyncStore((state) => state.status);
  const [outboxOps, setOutboxOps] = useState<OutboxOp[]>([]);
  const [cursors, setCursors] = useState<Array<{ collectionKey: string; cursor: string }>>([]);
  const [conflicts, setConflicts] = useState<Array<{ id: string; entityKey: string; entityId: string; createdAt: number }>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      // Load outbox ops
      const ops = await Outbox.getRecentOps(DEFAULT_SCOPE, 100);
      setOutboxOps(ops);

      // Load cursors (hardcoded collection keys for now)
      const collectionKeys = ['example_items'];
      const cursorData = await Promise.all(
        collectionKeys.map(async (key) => ({
          collectionKey: key,
          cursor: await getCursor(DEFAULT_SCOPE, key),
        }))
      );
      setCursors(cursorData);

      // Load conflicts
      const allConflicts = await getAllConflicts(DEFAULT_SCOPE, 50);
      setConflicts(
        allConflicts.map((c) => ({
          id: c.id,
          entityKey: c.entityKey,
          entityId: c.entityId,
          createdAt: c.createdAt,
        }))
      );
    } catch (error) {
      console.error('Failed to load debug data:', error);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 2 seconds
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleForceSync = async () => {
    const orchestrator = getSyncOrchestrator();
    if (!orchestrator) {
      Alert.alert('Error', 'Sync orchestrator not initialized');
      return;
    }

    try {
      await orchestrator.triggerForegroundSync();
      Alert.alert('Success', 'Foreground sync triggered');
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to trigger sync');
    }
  };

  const handleForceSignal = async () => {
    const orchestrator = getSyncOrchestrator();
    if (!orchestrator) {
      Alert.alert('Error', 'Sync orchestrator not initialized');
      return;
    }

    const didTrigger = orchestrator.debugTriggerSignal?.();
    if (!didTrigger) {
      Alert.alert('Info', 'Signal adapter does not support manual triggers');
      return;
    }

    Alert.alert('Success', 'Signal triggered');
  };

  const handleOutboxSuccess = () => {
    const { outboxAdapter } = getStubAdapters();
    outboxAdapter.setBehavior('succeed');
    Alert.alert('Success', 'Outbox set to succeed');
  };

  const handleOutboxFail = () => {
    const { outboxAdapter } = getStubAdapters();
    outboxAdapter.setBehavior('fail');
    Alert.alert('Success', 'Outbox set to fail');
  };

  const handleResolveConflict = async (conflictId: string) => {
    try {
      await resolveConflict(conflictId);
      await loadData();
      Alert.alert('Success', 'Conflict resolved');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resolve conflict');
    }
  };

  if (!__DEV__) {
    return (
      <Screen title="Sync Debug">
        <View style={styles.container}>
          <AppText variant="body">This screen is only available in dev mode.</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Sync Debug">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Sync Status */}
        <View style={styles.section}>
          <AppText
            variant="caption"
            style={[styles.sectionTitle, textEmphasis.sectionLabel, getTextSecondaryStyle(uiKitTheme)]}
          >
            Sync Status
          </AppText>
          <View style={[surface.overflowHidden, getCardStyle(uiKitTheme, { radius: 12, padding: theme.spacing.lg })]}>
            <StatusRow label="Online" value={status.isOnline ? 'Yes' : 'No'} uiKitTheme={uiKitTheme} />
            <StatusRow label="Syncing" value={status.isSyncing ? 'Yes' : 'No'} uiKitTheme={uiKitTheme} />
            <StatusRow label="Pending Ops" value={status.pendingOutboxOps.toString()} uiKitTheme={uiKitTheme} />
            <StatusRow label="Last Sync" value={formatTimestamp(status.lastSyncAt)} uiKitTheme={uiKitTheme} />
            {status.lastError && (
              <View style={styles.errorRow}>
                <AppText variant="caption" style={getTextSecondaryStyle(uiKitTheme)}>
                  Last Error:
                </AppText>
                <AppText variant="caption" style={styles.errorText}>
                  {status.lastError.code}: {status.lastError.message}
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <AppText
            variant="caption"
            style={[styles.sectionTitle, textEmphasis.sectionLabel, getTextSecondaryStyle(uiKitTheme)]}
          >
            Actions
          </AppText>
          <AppButton title="Force Foreground Sync" onPress={handleForceSync} style={styles.button} />
          <AppButton title="Force Signal" variant="secondary" onPress={handleForceSignal} style={styles.button} />
          <AppButton title="Simulate Outbox Success" variant="secondary" onPress={handleOutboxSuccess} style={styles.button} />
          <AppButton title="Simulate Outbox Failure" variant="secondary" onPress={handleOutboxFail} style={styles.button} />
        </View>

        {/* Cursors */}
        <View style={styles.section}>
          <AppText
            variant="caption"
            style={[styles.sectionTitle, textEmphasis.sectionLabel, getTextSecondaryStyle(uiKitTheme)]}
          >
            Cursors
          </AppText>
          <View style={[surface.overflowHidden, getCardStyle(uiKitTheme, { radius: 12, padding: theme.spacing.lg })]}>
            {cursors.length === 0 ? (
              <AppText variant="body" style={getTextSecondaryStyle(uiKitTheme)}>
                No cursors
              </AppText>
            ) : (
              cursors.map((c) => (
                <StatusRow
                  key={c.collectionKey}
                  label={c.collectionKey}
                  value={c.cursor.substring(0, 20) + (c.cursor.length > 20 ? '...' : '')}
                  uiKitTheme={uiKitTheme}
                />
              ))
            )}
          </View>
        </View>

        {/* Conflicts */}
        <View style={styles.section}>
          <AppText
            variant="caption"
            style={[styles.sectionTitle, textEmphasis.sectionLabel, getTextSecondaryStyle(uiKitTheme)]}
          >
            Conflicts ({conflicts.length})
          </AppText>
          {conflicts.length === 0 ? (
            <View style={[surface.overflowHidden, getCardStyle(uiKitTheme, { radius: 12, padding: theme.spacing.lg })]}>
              <AppText variant="body" style={getTextSecondaryStyle(uiKitTheme)}>
                No conflicts
              </AppText>
            </View>
          ) : (
            conflicts.map((conflict) => (
              <View
                key={conflict.id}
                style={[surface.overflowHidden, getCardStyle(uiKitTheme, { radius: 12, padding: theme.spacing.lg }), styles.conflictCard]}
              >
                <StatusRow label="Entity" value={`${conflict.entityKey}:${conflict.entityId}`} uiKitTheme={uiKitTheme} />
                <StatusRow label="Created" value={formatDate(conflict.createdAt)} uiKitTheme={uiKitTheme} />
                <AppButton
                  title="Resolve"
                  variant="secondary"
                  onPress={() => handleResolveConflict(conflict.id)}
                  style={styles.resolveButton}
                />
              </View>
            ))
          )}
        </View>

        {/* Outbox Ops */}
        <View style={styles.section}>
          <AppText
            variant="caption"
            style={[styles.sectionTitle, textEmphasis.sectionLabel, getTextSecondaryStyle(uiKitTheme)]}
          >
            Outbox Ops ({outboxOps.length})
          </AppText>
          {outboxOps.length === 0 ? (
            <View style={[surface.overflowHidden, getCardStyle(uiKitTheme, { radius: 12, padding: theme.spacing.lg })]}>
              <AppText variant="body" style={getTextSecondaryStyle(uiKitTheme)}>
                No pending operations
              </AppText>
            </View>
          ) : (
            outboxOps.slice(0, 10).map((op) => {
              const payload = safeJsonDecode(op.payloadJson);
              return (
                <View
                  key={op.id}
                  style={[surface.overflowHidden, getCardStyle(uiKitTheme, { radius: 12, padding: theme.spacing.lg }), styles.opCard]}
                >
                  <StatusRow label="ID" value={op.id.substring(0, 8) + '...'} uiKitTheme={uiKitTheme} />
                  <StatusRow label="Entity" value={`${op.entityKey}:${(payload as any)?.id || 'unknown'}`} uiKitTheme={uiKitTheme} />
                  <StatusRow label="Type" value={op.opType} uiKitTheme={uiKitTheme} />
                  <StatusRow label="State" value={op.state} uiKitTheme={uiKitTheme} />
                  <StatusRow label="Attempts" value={op.attemptCount.toString()} uiKitTheme={uiKitTheme} />
                  {op.lastErrorJson && (
                    <View style={styles.errorRow}>
                      <AppText variant="caption" style={getTextSecondaryStyle(uiKitTheme)}>
                        Error:
                      </AppText>
                      <AppText variant="caption" style={styles.errorText}>
                        {JSON.stringify(safeJsonDecode(op.lastErrorJson))}
                      </AppText>
                    </View>
                  )}
                </View>
              );
            })
          )}
          {outboxOps.length > 10 && (
            <AppText variant="caption" style={[styles.moreText, getTextSecondaryStyle(uiKitTheme)]}>
              ... and {outboxOps.length - 10} more
            </AppText>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatusRow({ label, value, uiKitTheme }: { label: string; value: string; uiKitTheme: any }) {
  return (
    <View style={[layout.rowBetween, styles.rowGap]}>
      <AppText variant="body" style={getTextSecondaryStyle(uiKitTheme)}>
        {label}
      </AppText>
      <AppText variant="body" style={textEmphasis.value}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: layout.screenBodyTopMd.paddingTop,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  rowGap: {
    gap: 12,
    marginBottom: 8,
  },
  errorRow: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 4,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
  },
  button: {
    marginTop: 8,
  },
  conflictCard: {
    marginBottom: 8,
  },
  opCard: {
    marginBottom: 8,
  },
  resolveButton: {
    marginTop: 8,
  },
  moreText: {
    marginTop: 8,
    textAlign: 'center',
  },
});
