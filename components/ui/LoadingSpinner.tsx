import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Typography } from './Typography';
import { space, useThemeStore } from '../../lib/theme';

export interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
  /** Optional line under the spinner. */
  label?: string;
}

/**
 * Spinner.
 *
 * `large` now carries a label by convention, because an unlabelled spinner in
 * the middle of a screen tells a screen-reader user nothing about whether the
 * app is working or stuck. The spinner is marked `accessibilityRole="progressbar"`
 * and labelled, so it is announced as activity rather than skipped.
 */
export function LoadingSpinner({ size = 'small', style, label }: LoadingSpinnerProps) {
  const colors = useThemeStore((state) => state.colors);
  const large = size === 'large';

  return (
    <View
      accessible={large}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      style={[styles.container, large ? styles.largeContainer : null, style]}
    >
      <ActivityIndicator size={size} color={colors.primary} />
      {label ? (
        <Typography variant="caption" color={colors.textMuted} style={styles.label}>
          {label}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, alignItems: 'center', justifyContent: 'center' },
  largeContainer: { paddingVertical: space.xxxl, gap: space.md },
  label: { textAlign: 'center' },
});
