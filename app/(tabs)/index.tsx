import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { AppButton } from '../../src/components/AppButton';
import { BrandLogo } from '../../src/components/BrandLogo';
import { useAuthStore } from '../../src/auth/authStore';
import { useQuotaStore } from '../../src/quota/quotaStore';
import { canCreate, requireProOrQuota } from '../../src/quota/quotaStore';
import { appConfig } from '../../src/config/appConfig';
import { theme } from '../../src/theme/theme';
import { useEffect } from 'react';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { loadCounters, counters } = useQuotaStore();

  useEffect(() => {
    if (user) {
      loadCounters(user.uid);
    }
  }, [user]);

  const handleCreateObject = () => {
    const objectKey = 'object'; // Example quota key
    const quota = appConfig.quotas[objectKey];

    if (!requireProOrQuota(objectKey)) {
      // Show paywall
      router.push('/paywall');
      return;
    }

    // Proceed with creation (in real app, this would call a Cloud Function)
    Alert.alert(
      'Create Object',
      `You can create this ${quota.displayName}. Current count: ${counters[objectKey] || 0}/${quota.freeLimit}`
    );
  };

  const objectKey = 'object';
  const quota = appConfig.quotas[objectKey];
  const currentCount = counters[objectKey] || 0;

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.logoRow}>
          <BrandLogo size={72} />
        </View>

        <AppText variant="h1" style={styles.title}>
          Welcome
        </AppText>

        <AppText variant="body" style={styles.subtitle}>
          {user?.email}
        </AppText>

        {quota && (
          <View style={styles.quotaSection}>
            <AppText variant="h2" style={styles.quotaTitle}>
              Quota Status
            </AppText>
            <AppText variant="body" style={styles.quotaText}>
              {quota.displayName}: {currentCount} / {quota.freeLimit}
            </AppText>
            <AppText variant="caption" style={styles.quotaHint}>
              {canCreate(objectKey)
                ? `You can create ${quota.freeLimit - currentCount} more ${quota.displayName} for free`
                : 'Upgrade to Pro for unlimited'}
            </AppText>
          </View>
        )}

        <AppButton
          title="Create Object (Example)"
          onPress={handleCreateObject}
          style={styles.button}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: theme.spacing.xl,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    marginBottom: theme.spacing.xl,
    color: theme.colors.textSecondary,
  },
  quotaSection: {
    backgroundColor: theme.card.backgroundColor,
    padding: theme.spacing.lg,
    borderRadius: 8,
    marginBottom: theme.spacing.xl,
  },
  quotaTitle: {
    marginBottom: theme.spacing.sm,
  },
  quotaText: {
    marginBottom: theme.spacing.xs,
  },
  quotaHint: {
    marginTop: theme.spacing.xs,
  },
  button: {
    marginTop: theme.spacing.md,
  },
});
