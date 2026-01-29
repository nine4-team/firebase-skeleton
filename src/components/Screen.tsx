import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getScreenContainerStyle, getScreenContentStyle, SCREEN_PADDING } from '@nine4/ui-kit';
import { uiKitTheme } from '../theme/theme';

interface ScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Screen: React.FC<ScreenProps> = ({ children, style }) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        getScreenContainerStyle(uiKitTheme),
        getScreenContentStyle({ insets, paddingHorizontal: SCREEN_PADDING }),
        style,
      ]}
    >
      {children}
    </View>
  );
};
