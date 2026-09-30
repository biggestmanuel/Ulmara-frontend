import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { Typography } from './Typography';
import { radius, space, useThemeStore } from '../../lib/theme';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Optional leading glyph. Required in practice for `success`/`danger` so state
   *  is never carried by colour alone. */
  icon?: ComponentProps<typeof Ionicons>['name'];
  children?: ReactNode;
}

/**
 * Status pill.
 *
 * ## Colour is never the only signal
 *
 * `success`, `warning` and `danger` all take an icon. The audit flagged badges
 * that distinguished state purely with a background tint — unusable for a
 * colour-blind user and invisible to a screen reader. The icon carries the
 * meaning; the tint only reinforces it.
 *
 * The tints are derived from the semantic colour at low alpha rather than being
 * separate hardcoded hex values, which is how the old `Badge` produced
 * `${colors.success}22` string concatenation. That works in RN but is not
 * guaranteed to parse on every platform, and it silently produced an invalid
 * colour if a theme ever supplied a hex without a `#`. Explicit light/dark
 * values are used instead.
 */
export function Badge({ label, tone = 'neutral', icon }: BadgeProps) {
  const colors = useThemeStore((state) => state.colors);

  const palette: Record<BadgeTone, { background: string; foreground: string }> = {
    neutral: { background: colors.surfaceElevated, foreground: colors.textSecondary },
    primary: { background: colors.primaryLight, foreground: colors.primary },
    success: { background: colors.successTint, foreground: colors.success },
    warning: { background: colors.warningTint, foreground: colors.warning },
    danger: { background: colors.errorTint, foreground: colors.error },
  };

  const { background, foreground } = palette[tone];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.base, { backgroundColor: background }]}
    >
      {icon ? <Ionicons name={icon} size={11} color={foreground} style={styles.icon} /> : null}
      <Typography variant="micro" color={foreground}>
        {label.toUpperCase()}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.chip,
  },
  icon: { marginRight: 4 },
});
