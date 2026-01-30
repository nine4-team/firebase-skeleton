import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/auth/authStore';
import { useBillingStore } from '../src/billing/billingStore';
import { LoadingScreen, SafeModeScreen, SyncStatusBar } from '../src/components';
import { isAuthBypassEnabled } from '../src/auth/authConfig';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { useDatabaseInit } from '../src/data/offline-first/dbStore';
import {
  getSyncOrchestrator,
  initializeSyncOrchestrator,
  resetDatabase,
  useSyncOrchestrator,
  DefaultConflictDetector,
  type Scope,
} from '../src/data/offline-first';
import { ExampleDeltaHandler } from '../src/data/offline-first/exampleHandler';
import { getStubAdapters } from '../src/data/offline-first/stubAdapters';

const DEFAULT_SCOPE: Scope = { type: 'global' };

export default function RootLayout() {
  const { user, isInitialized, initialize } = useAuthStore();
  const { isInitialized: billingInitialized, initialize: initializeBilling } = useBillingStore();
  const {
    isInitialized: dbInitialized,
    isInitializing: dbInitializing,
    error: dbError,
    retry: retryDbInit,
  } = useDatabaseInit();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsubscribe = initialize();
    initializeBilling();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!dbInitialized) {
      return;
    }

    if (getSyncOrchestrator()) {
      return;
    }

    // Initialize with stub adapters for dev/testing.
    // Replace these stubs with real adapters in production apps.
    const { outboxAdapter, deltaAdapter, signalAdapter } = getStubAdapters();
    initializeSyncOrchestrator(
      outboxAdapter,
      deltaAdapter,
      signalAdapter,
      {
        collectionKeys: ['example_items'],
        deltaChangeHandler: __DEV__ ? new ExampleDeltaHandler() : undefined,
        conflictDetector: __DEV__ ? new DefaultConflictDetector() : undefined,
      }
    );
  }, [dbInitialized]);

  useSyncOrchestrator(dbInitialized ? DEFAULT_SCOPE : undefined);

  useEffect(() => {
    if (!isInitialized || !billingInitialized || !dbInitialized) {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const isPaywall = segments[0] === 'paywall';
    const isAllowed = Boolean(user) || isAuthBypassEnabled;

    if (user && inAuthGroup) {
      // User is signed in but in auth routes, redirect to tabs
      router.replace('/(tabs)');
    } else if (!isAllowed && !inAuthGroup && !isPaywall) {
      // User is not signed in and not in auth routes or paywall, redirect to auth
      router.replace('/(auth)/sign-in');
    }
  }, [user, isInitialized, billingInitialized, dbInitialized, segments, router]);

  return (
    <ThemeProvider>
      <View style={styles.root}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="paywall" />
        </Stack>

        {/* Sync status bar - shows offline banner and sync status */}
        {dbInitialized && <SyncStatusBar />}

        {/* Database initialization error - show safe mode */}
        {dbError && !dbInitializing && (
          <View style={styles.loadingOverlay} pointerEvents="auto">
            <SafeModeScreen
              error={dbError}
              onRetry={retryDbInit}
              showReset={__DEV__}
              onReset={async () => {
                try {
                  await resetDatabase();
                  await retryDbInit();
                } catch (error) {
                  console.warn('Failed to reset local cache', error);
                }
              }}
            />
          </View>
        )}

        {/* Loading state */}
        {(!isInitialized || !billingInitialized || dbInitializing) && !dbError && (
          <View style={styles.loadingOverlay} pointerEvents="auto">
            <LoadingScreen />
          </View>
        )}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
