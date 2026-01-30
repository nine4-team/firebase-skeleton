/**
 * Offline banner component
 * Part of Milestone D: Signal + Lifecycle
 * 
 * Shows a non-blocking banner when the app is offline.
 * Local reads still work; this is just informational.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { useTheme, useUIKitTheme } from '../theme/ThemeProvider';

interface OfflineBannerProps {
  isOnline: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOnline }) => {
  const theme = useTheme();
  const uiKitTheme = useUIKitTheme();

  if (isOnline) {
    return null;
  }

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: uiKitTheme.surface.error || '#FF3B30',
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <AppText variant="caption" style={styles.text}>
        Offline — Changes will sync when you're back online
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
