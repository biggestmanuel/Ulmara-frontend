import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Typography } from './Typography';
import { Touchable, type TouchableProps } from '../../lib/hooks/usePressScale';
import { controlHeight, gutter, radius, space, useThemeStore } from '../../lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<TouchableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Stretches to the container width. The default for every primary action. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Visual text to hand to a screen reader when `label` is not descriptive on
   * its own — e.g. label "Confirm" on a screen about deleting a contact.
   */
  accessibilityLabel?: string;
}

/**
 * The app's one button.
 *
 * ## What changed, and why
 *
 * The previous `Button` was already the right *size* (56) but the wrong
 * *object*: `primary` painted a coloured shadow underneath itself
 * (`shadowOpacity: 0.25`, `shadowRadius: 8`, `elevation: 4`) and the radius was
 * 18. A glowing button is the visual signature of a marketing landing page, and
 * in a product used dozens of times a day it reads as decoration competing with
 * the numbers.
 *
 * The redesign makes the button a **flat, matte fill**. Depth comes from
 * contrast against the page, not from a shadow. Press feedback is a 3% scale on
 * the UI thread (`Touchable`), which is felt rather than seen.
 *
 * It also fixes two real defects:
 *
 * - `loading` used to render an `ActivityIndicator` **instead of** the label,
 *  so the button changed width mid-action and the user lost their place. The
 *   label stays and the spinner sits beside it.
 * - `disabled` was only `opacity: 0.45`, which does not reliably read as
 *   disabled. It now also reports `accessibilityState={{ disabled }}` and drops
 *   the fill contrast, so state is never conveyed by opacity alone.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const colors = useThemeStore((state) => state.colors);
  const isInactive = disabled || loading;

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    ghost: { backgroundColor: 'transparent' },
    destructive: { backgroundColor: colors.error },
  };

  const labelColor: Record<ButtonVariant, string> = {
    primary: colors.onPrimary,
    secondary: colors.textPrimary,
    ghost: colors.primary,
    destructive: colors.onPrimary,
  };

  // A ghost button has no fill, so a disabled one must not look like an active
  // accent label. Fold that into the same treatment as the filled variants.
  const effectiveLabelColor = isInactive && variant === 'ghost' ? colors.textMuted : labelColor[variant];

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isInactive, busy: !!loading }}
      disabled={isInactive}
      // No press animation while an action is in flight — the button should
      // look settled, not springy, while it is working.
      animatePress={!isInactive}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        fullWidth && styles.fullWidth,
        surface[variant],
        isInactive && styles.inactive,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content} pointerEvents="none">
        {loading ? (
          <ActivityIndicator size="small" color={effectiveLabelColor} style={styles.spinner} />
        ) : null}
        <Typography
          variant={size === 'sm' ? 'label' : 'titleSm'}
          color={effectiveLabelColor}
          numberOfLines={1}
        >
          {label}
        </Typography>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: { height: controlHeight, paddingHorizontal: gutter },
  sm: { height: 44, paddingHorizontal: space.lg },
  fullWidth: { alignSelf: 'stretch' },
  inactive: { opacity: 0.4 },
  content: { flexDirection: 'row', alignItems: 'center' },
  spinner: { marginRight: space.sm },
});
