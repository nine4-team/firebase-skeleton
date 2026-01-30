/**
 * Safe-mode UI for fatal initialization failures
 * Part of Milestone A: Local DB Foundation
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '../theme/ThemeProvider';

export interface SafeModeScreenProps {
  error: Error;
  onRetry: () => void;
  onReset?: () => void;
  showReset?: boolean;
}

export const SafeModeScreen: React.FC<SafeModeScreenProps> = ({
  error,
  onRetry,
  onReset,
  showReset = false,
}) => {
  const theme = useTheme();
  const themed = useMemo(
    () =>
      StyleSheet.create({
        container: {
          padding: theme.spacing.lg,
        },
        title: {
          marginBottom: theme.spacing.md,
        },
        errorBox: {
          backgroundColor: theme.colors.error + '20',
          padding: theme.spacing.md,
          borderRadius: theme.borderRadius.md,
          marginBottom: theme.spacing.lg,
        },
        errorText: {
          color: theme.colors.error,
          fontFamily: theme.typography.fontFamily.mono,
          fontSize: 12,
        },
        buttonContainer: {
          gap: theme.spacing.md,
        },
      }),
    [theme]
  );

  const handleReset = () => {
    Alert.alert(
      'Reset Local Cache',
      'This will delete all local data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: onReset,
        },
      ]
    );
  };

  return (
    <Screen style={[styles.container, themed.container]}>
      <AppText variant="heading" style={themed.title}>
        Database Initialization Failed
      </AppText>

      <AppText variant="body" style={{ marginBottom: theme.spacing.md }}>
        The app could not initialize its local database. This may be due to a
        migration error or corrupted local state.
      </AppText>

      <View style={themed.errorBox}>
        <AppText variant="caption" style={themed.errorText}>
          {error.message}
        </AppText>
      </View>

      <View style={themed.buttonContainer}>
        <AppButton title="Retry Initialization" onPress={onRetry} />
        {showReset && onReset && (
          <AppButton
            title="Reset Local Cache"
            onPress={handleReset}
            variant="secondary"
          />
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
});
