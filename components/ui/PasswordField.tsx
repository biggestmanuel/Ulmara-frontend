import { memo, useCallback, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Typography } from './Typography';
import { IconButton } from './IconButton';
import { controlHeight, radius, space, touchTarget, useThemeStore } from '../../lib/theme';

interface PasswordFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry' | 'value'> {
  value: string;
  onChangeText: (value: string) => void;
  /** Visible label rendered above the field. */
  label?: string;
  error?: string;
  hint?: string;
  /** Extra style for the field wrapper (e.g. bottom margin). */
  wrapperStyle?: StyleProp<ViewStyle>;
  /** Replaces the default "Show/Hide password" accessibility labels. */
  showLabel?: string;
  hideLabel?: string;
}

/**
 * Password input with a show/hide visibility toggle.
 *
 * ## Preserved from the previous fix
 *
 * The toggle is a sibling absolutely positioned over the *right* edge of the
 * field, and that vertical anchoring is load-bearing. Without `top: 0` +
 * `bottom: 0` + `justifyContent: 'center'` the absolutely positioned button
 * falls back to its static position — being the second child of a column, it
 * lands directly *underneath* the input and the icon is invisible. The field
 * also reserves right-hand padding equal to the button's width so typed text
 * never runs under the icon. This was a real bug and the fix stays.
 *
 * ## What the redesign changed
 *
 * The toggle is now an `IconButton`, which upgrades it from a 32pt box to the
 * 44pt minimum target, and gives it `accessibilityState={{ checked }}` so a
 * screen reader announces "Show password, selected" rather than leaving the
 * user to infer state from the label text alone. The field also picks up the
 * shared `Input` treatment: a 2pt accent border on focus, and a live-region
 * error slot — previously a failed password check replaced the whole form and
 * nothing was announced.
 */
function PasswordFieldComponent({
  value,
  onChangeText,
  label,
  error,
  hint,
  wrapperStyle,
  showLabel = 'Show password',
  hideLabel = 'Hide password',
  onFocus,
  onBlur,
  ...rest
}: PasswordFieldProps) {
  const colors = useThemeStore((state) => state.colors);
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  const toggle = useCallback(() => setVisible((v) => !v), []);

  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;
  const borderWidth = focused || error ? 2 : 1;

  return (
    <View style={[styles.wrapper, wrapperStyle]}>
      {label ? (
        <Typography variant="label" color={colors.textSecondary}>
          {label}
        </Typography>
      ) : null}

      <View style={styles.wrap}>
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          accessibilityLabel={rest.accessibilityLabel ?? label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor,
              borderWidth,
              color: colors.textPrimary,
            },
          ]}
        />
        <View style={styles.toggle} pointerEvents="box-none">
          <PasswordToggle
            visible={visible}
            onPress={toggle}
            showLabel={showLabel}
            hideLabel={hideLabel}
            iconColor={visible ? colors.primary : colors.textMuted}
          />
        </View>
      </View>

      {error ? (
        <Typography
          variant="label"
          color={colors.error}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Typography>
      ) : hint ? (
        <Typography variant="caption" color={colors.textMuted}>
          {hint}
        </Typography>
      ) : null}
    </View>
  );
}

/**
 * Split out so the `IconButton`'s own 44pt box is the positioning anchor. The
 * previous implementation put `position: 'absolute'` directly on the pressable,
 * which combined with its 32pt width produced a target well under the platform
 * minimum.
 */
function PasswordToggle({
  visible,
  onPress,
  showLabel,
  hideLabel,
  iconColor,
}: {
  visible: boolean;
  onPress: () => void;
  showLabel: string;
  hideLabel: string;
  iconColor: string;
}) {
  return (
    <IconButton
      accessibilityLabel={visible ? hideLabel : showLabel}
      accessibilityState={{ checked: visible }}
      onPress={onPress}
      pressScale={0.9}
    >
      <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={iconColor} />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space.sm },
  wrap: { position: 'relative', justifyContent: 'center' },
  input: {
    height: controlHeight,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    // Clear the toggle so the value is never rendered underneath the icon.
    paddingRight: touchTarget + space.md,
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
  },
  toggle: {
    position: 'absolute',
    right: space.xs,
    top: 0,
    bottom: 0,
    width: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const PasswordField = memo(PasswordFieldComponent);
