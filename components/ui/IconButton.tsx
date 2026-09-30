import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Touchable, type TouchableProps } from '../../lib/hooks/usePressScale';
import { radius, space, touchTarget, useThemeStore } from '../../lib/theme';

export interface IconButtonProps extends Omit<TouchableProps, 'style' | 'children' | 'accessibilityRole'> {
  /**
   * Required. The audit found 150 `Pressable`s against only 50
   * `accessibilityLabel`s, and every icon-only control is invisible to a screen
   * reader without one. Making it a required prop rather than an optional one
   * is the point: it is now impossible to add a new icon button without naming
   * it.
   */
  accessibilityLabel: string;
  /** Rendered children — normally an `Ionicons` element. */
  children: React.ReactNode;
  /** Visual box. Defaults to the 44pt minimum touch target. */
  size?: number;
  /** `filled` paints a quiet circle behind the icon; `plain` does not. */
  variant?: 'plain' | 'filled';
  /** Optional visible ring, for the current selection. */
  selected?: boolean;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Extra context for a screen reader, e.g. "Opens the send flow". Optional —
   * `accessibilityLabel` alone is usually enough, and a hint on every control
   * is noise.
   */
  accessibilityHint?: string;
}

/**
 * Icon-only control.
 *
 * The redesign routes every icon-only affordance through this: back arrows,
 * close buttons, the password visibility toggle, the copy control, notification
 * and settings buttons in headers, per-row send/edit/delete actions.
 *
 * Guarantees it provides that a bare `Pressable` does not:
 *
 * - a required accessible name;
 * - a visible 44×44 target even when the icon is 20pt (`hitSlop` alone is not
 *   enough — it does not change what a screen reader or switch device reports);
 * - `accessibilityState` for `selected` / `disabled`, so selection is never
 *   signalled by colour alone;
 * - press feedback on the UI thread.
 */
export function IconButton({
  accessibilityLabel,
  children,
  size = touchTarget,
  variant = 'plain',
  selected = false,
  iconColor,
  style,
  accessibilityHint,
  disabled,
  ...rest
}: IconButtonProps) {
  const colors = useThemeStore((state) => state.colors);
  const background = selected
    ? colors.primaryLight
    : variant === 'filled'
      ? colors.surfaceElevated
      : 'transparent';

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius.chip, backgroundColor: background },
        disabled ? styles.disabled : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Touchable>
  );
}

/** Convenience: the default tint for an icon inside an `IconButton`. */
export function useIconColor(tone: 'default' | 'primary' | 'danger' = 'default'): string {
  const colors = useThemeStore((state) => state.colors);
  if (tone === 'primary') return colors.primary;
  if (tone === 'danger') return colors.error;
  return colors.textPrimary;
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});

export const iconButtonSpacing = space;
