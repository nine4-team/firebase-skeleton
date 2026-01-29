import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { theme } from '../theme/theme';

interface AppTextProps extends TextProps {
  variant?: 'h1' | 'h2' | 'body' | 'caption';
}

export const AppText: React.FC<AppTextProps> = ({
  variant = 'body',
  style,
  children,
  ...props
}) => {
  return (
    <Text style={[styles[variant], style]} {...props}>
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  h1: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  h2: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  body: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  caption: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
