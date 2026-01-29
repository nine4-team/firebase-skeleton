import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { AppButton } from '../../src/components/AppButton';
import { useAuthStore } from '../../src/auth/authStore';
import { useBillingStore } from '../../src/billing/billingStore';
import { usePro } from '../../src/billing/billingStore';
import { isAuthBypassEnabled } from '../../src/auth/authConfig';
import { theme } from '../../src/theme/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { restorePurchases } = useBillingStore();
  const isPro = usePro();

  const handleSignOut = async () => {
    if (isAuthBypassEnabled) {
      router.replace('/(auth)/sign-in?preview=1');
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/(auth)/sign-in');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to sign out');
          }
        },
      },
    ]);
  };

  const handleRestorePurchases = async () => {
    try {
      await restorePurchases();
      Alert.alert('Success', 'Purchases restored');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to restore purchases');
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="h1" style={styles.title}>
          Settings
        </AppText>

        <View style={styles.section}>
          <AppText variant="body" style={styles.label}>
            Email
          </AppText>
          <AppText variant="body" style={styles.value}>
            {user?.email}
          </AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="body" style={styles.label}>
            Subscription
          </AppText>
          <AppText variant="body" style={[styles.value, isPro && styles.proText]}>
            {isPro ? 'Pro' : 'Free'}
          </AppText>
        </View>

        {!isPro && (
          <AppButton
            title="Upgrade to Pro"
            onPress={() => router.push('/paywall')}
            style={styles.button}
          />
        )}

        <AppButton
          title="Restore Purchases"
          variant="secondary"
          onPress={handleRestorePurchases}
          style={styles.button}
        />

        <AppButton
          title={isAuthBypassEnabled ? 'Sign In' : 'Sign Out'}
          variant="secondary"
          onPress={handleSignOut}
          style={[styles.button, styles.signOutButton]}
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
  title: {
    marginBottom: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  value: {
    fontWeight: '500',
  },
  proText: {
    color: theme.colors.primary,
  },
  button: {
    marginTop: theme.spacing.md,
  },
  signOutButton: {
    marginTop: theme.spacing.xl,
  },
});
