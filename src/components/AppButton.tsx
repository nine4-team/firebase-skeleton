import React from 'react';
import { View, TouchableOpacity, TouchableOpacityProps, StyleSheet, ActivityIndicator } from 'react-native';
import { AppText } from './AppText';
import { BUTTON_BORDER_RADIUS } from '@nine4/ui-kit';
import { theme, uiKitTheme } from '../theme/theme';

interface AppButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  style?: TouchableOpacityProps['style'];
}

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  variant = 'primary',
  loading = false,
  disabled,
  leftIcon,
  style,
  ...props
}) => {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isPrimary ? styles.primary : styles.secondary,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? uiKitTheme.button.primary.text : uiKitTheme.button.secondary.text}
        />
      ) : (
        <View style={styles.content}>
          {!!leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
          <AppText
            variant="body"
            style={[isPrimary ? styles.primaryText : styles.secondaryText]}
          >
            {title}
          </AppText>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: BUTTON_BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIcon: {
    marginRight: 10,
  },
  primary: {
    backgroundColor: uiKitTheme.button.primary.background,
  },
  secondary: {
    backgroundColor: uiKitTheme.button.secondary.background,
    borderWidth: 1,
    borderColor: uiKitTheme.border.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: uiKitTheme.button.primary.text,
    fontWeight: '600',
  },
  secondaryText: {
    color: uiKitTheme.button.secondary.text,
    fontWeight: '600',
  },
});
