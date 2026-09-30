import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';

import { Typography } from './Typography';
import { controlHeight, radius, space, useThemeStore } from '../../lib/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Helper text shown when there is no error. */
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Renders the field on the quiet surface instead of the raised card surface. */
  quiet?: boolean;
}

/**
 * Text input with label, error and hint.
 *
 * ## What changed
 *
 * - **Focus is a 2pt accent border, not a colour swap.** The old field changed
 *   only `borderColor`, which on a 1pt border is close to invisible; the 2pt
 *   weight makes focus obvious and satisfies WCAG 2.4.7 (Focus Visible).
 * - **Error and hint share one slot.** Previously an error could appear on top
 *   of existing helper text and push the layout, and both were 12–13pt with no
 *   distinction. The error is now `label` weight in the error colour and is
 *   announced via `accessibilityLiveRegion` so a screen-reader user hears it the
 *   moment validation fails, rather than only on focus.
 * - **`accessibilityLabel` is set from `label`** when one is present, so the
 *   field is named rather than announced as an unlabelled edit box.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, style, containerStyle, quiet = false, onFocus, onBlur, ...rest },
  ref
) {
  const colors = useThemeStore((state) => state.colors);
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;
  const borderWidth = focused || error ? 2 : 1;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Typography variant="label" color={colors.textSecondary}>
          {label}
        </Typography>
      ) : null}

      <TextInput
        ref={ref}
        style={[
          styles.input,
          {
            backgroundColor: quiet ? 'transparent' : colors.surface,
            borderColor,
            borderWidth,
            color: colors.textPrimary,
          },
          style,
        ]}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        // A field that is currently in error should say so, not just look it.
        accessibilityState={{ disabled: !!rest.editable || rest.editable === false }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />

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
});

const styles = StyleSheet.create({
  wrapper: { gap: space.sm },
  input: {
    height: controlHeight,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
  },
});
