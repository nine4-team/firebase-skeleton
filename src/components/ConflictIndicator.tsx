/**
 * Conflict indicator component
 * Part of Milestone E: Conflicts + Dev Tooling
 * 
 * Shows a non-blocking indicator when conflicts exist.
 * Can be tapped to navigate to conflict resolution screen (app supplies navigation).
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText } from './AppText';
import { useTheme, useUIKitTheme } from '../theme/ThemeProvider';
import { countUnresolvedConflicts } from '../data/offline-first/conflicts';
import type { Scope } from '../data/offline-first/types';

interface ConflictIndicatorProps {
  scope: Scope;
  onPress?: () => void; // Optional: tap to navigate to conflict screen
}

export const ConflictIndicator: React.FC<ConflictIndicatorProps> = ({ scope, onPress }) => {
  const theme = useTheme();
  const uiKitTheme = useUIKitTheme();
  const [conflictCount, setConflictCount] = useState(0);

  // Poll for conflict count (could be replaced with a subscription/store in the future)
  useEffect(() => {
    let mounted = true;

    const updateCount = async () => {
      try {
        const count = await countUnresolvedConflicts(scope);
        if (mounted) {
          setConflictCount(count);
        }
      } catch (error) {
        console.warn('Failed to get conflict count:', error);
      }
    };

    // Initial update
    updateCount();

    // Poll every 2 seconds
    const interval = setInterval(updateCount, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [scope]);

  // Don't show if no conflicts
  if (conflictCount === 0) {
    return null;
  }

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: uiKitTheme.surface.warning || '#FF9500',
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.sm,
        },
      ]}
    >
      <AppText
        variant="caption"
        style={[
          styles.text,
          {
            color: '#FFFFFF',
          },
        ]}
      >
        {conflictCount === 1
          ? '1 conflict needs resolution'
          : `${conflictCount} conflicts need resolution`}
      </AppText>
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
  text: {
    textAlign: 'center',
    fontWeight: '500',
  },
});
