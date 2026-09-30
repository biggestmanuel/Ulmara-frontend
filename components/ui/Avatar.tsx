import { Image, StyleSheet, View } from 'react-native';
import type { StyleProp, ImageStyle } from 'react-native';

import { Typography } from './Typography';
import { radius, useThemeStore } from '../../lib/theme';

export interface AvatarProps {
  uri?: string | null;
  /** First letter shown when there is no image. */
  name?: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/**
 * Profile image with an initials fallback.
 *
 * ## Fixed
 *
 * The previous fallback carried a **hardcoded purple border**
 * (`rgba(99,91,255,0.18)`) and a **hardcoded `#EEE` fill**. Neither came from
 * the theme, so the component looked wrong in dark mode and would not have
 * followed any future palette change. Both now come from theme tokens, and the
 * fallback uses the accent tint so it stays consistent with the one accent the
 * app is allowed.
 */
export function Avatar({ uri, name = '', size = 44, style }: AvatarProps) {
  const colors = useThemeStore((state) => state.colors);
  const dimension = { width: size, height: size, borderRadius: radius.pill };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        style={[styles.image, dimension, { backgroundColor: colors.surfaceElevated }, style]}
      />
    );
  }

  return (
    <View
      accessible={false}
      style={[styles.fallback, dimension, { backgroundColor: colors.primaryLight }]}
    >
      <Typography variant="label" color={colors.primary}>
        {name.trim().slice(0, 1).toUpperCase() || '?'}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { resizeMode: 'cover' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
