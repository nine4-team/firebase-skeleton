import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { theme } from '../theme/theme';

export const LoadingScreen: React.FC = () => {
  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <AppText variant="body" style={styles.text}>
          Loading...
        </AppText>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  text: {
    marginTop: theme.spacing.md,
  },
});
