import { StyleSheet, TextInput, View } from 'react-native';

import { Typography } from '../ui';
import { space, useThemeStore } from '../../lib/theme';

interface AmountInputProps {
  value: string;
  onChangeText: (text: string) => void;
  symbol: string;
  usdEquivalent?: string;
  /** Validation message shown beneath the field. */
  error?: string | null;
  maxLength?: number;
}

/**
 * The amount field on the send and request screens.
 *
 * ## What changed
 *
 * - **It now has a label.** A bare 40pt number field with a ticker beside it is
 *   the single most important input in the app, and a screen reader met an
 *   unlabelled text field. It is announced as "Amount in <symbol>".
 * - **Tabular figures.** The user types, watches the value, and may retype it.
 *   With proportional digits the number visibly changes width as they type,
 *   which is uncomfortable on a screen where accuracy matters.
 * - The ticker sits as a suffix inside the field rather than beside a
 *   right-aligned number, so the eye tracks one line.
 * - A validation message has its own slot. Previously there was nowhere to put
 *   one, so "Enter an amount" had nowhere consistent to appear.
 */
export function AmountInput({
  value,
  onChangeText,
  symbol,
  usdEquivalent,
  error,
  maxLength,
}: AmountInputProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={[
          styles.input,
          { color: colors.textPrimary, borderColor: error ? colors.error : 'transparent' },
        ]}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
        maxLength={maxLength}
        accessibilityLabel={`Amount in ${symbol}`}
        accessibilityHint="Enter how much you want to send"
        returnKeyType="done"
      />
      <Typography variant="heading" color={colors.textMuted} style={styles.symbol}>
        {symbol}
      </Typography>

      {usdEquivalent ? (
        <Typography variant="caption" color={colors.textMuted} numeric style={styles.equiv}>
          {usdEquivalent}
        </Typography>
      ) : null}

      {error ? (
        <Typography
          variant="label"
          color={colors.error}
          style={styles.error}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: space.xs },
  input: {
    // 44pt, matching the `amount` step in the type scale, so the field the user
    // types into is the same size as the number it produces.
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '700',
    minWidth: 80,
    textAlign: 'center',
    borderBottomWidth: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    fontVariant: ['tabular-nums'],
  },
  symbol: { marginTop: -space.lg },
  equiv: { textAlign: 'center' },
  error: { textAlign: 'center', marginTop: space.xs },
});
