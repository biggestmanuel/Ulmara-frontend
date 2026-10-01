import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Typography } from './Typography';
import { Touchable } from '../../lib/hooks/usePressScale';
import { radius, space, useThemeStore } from '../../lib/theme';

export const PIN_LENGTH = 6;

/** 1-9, 0, delete. Laid out three-wide, thumb-reachable. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export interface KeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Blocks input while a PIN is being verified or saved. */
  disabled?: boolean;
  /** Overrides the delete key's spoken label. */
  deleteLabel?: string;
}

/**
 * The PIN entry keypad.
 *
 * This is the most safety-critical control in the app: it gates every transfer
 * and it now also gates account recovery. It was duplicated between
 * `create-pin.tsx` and `verify-pin.tsx` with **different accessibility
 * properties** — `verify-pin` labelled every key, `create-pin` labelled none,
 * so the PIN *setup* screen was unusable with a screen reader. One component,
 * one set of guarantees, fixes both.
 *
 * ## Accessibility
 *
 * - Every key is a real button with a spoken name. Delete announces as
 *   "Delete" rather than the glyph, and the key's role is reported as a button.
 * - Each key is 76pt tall across the full 1/3 column width — well above the 44pt
 *   minimum, because this is pressed repeatedly and in a hurry.
 * - `disabled` is reflected in `accessibilityState` so a pending verification
 *   does not look tappable.
 * - The dots are `accessibilityElementsHidden`: the PIN is a secret, and
 *   announcing "1 of 6 digits entered" leaks it. The count is exposed instead
 *   via `accessibilityValue` on the surrounding group, which is what a screen
 *   reader needs to know progress without learning the digits.
 */
export function Keypad({ onDigit, onDelete, disabled = false, deleteLabel = 'Delete' }: KeypadProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View style={styles.keypad} accessibilityRole="none">
      {KEYS.map((key, index) => {
        if (key === '') return <View key={index} style={styles.key} />;

        const isDelete = key === 'del';

        return (
          <Touchable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={isDelete ? deleteLabel : key}
            accessibilityState={{ disabled }}
            disabled={disabled}
            pressScale={0.9}
            onPress={() => (isDelete ? onDelete() : onDigit(key))}
            style={styles.key}
          >
            {isDelete ? (
              <Ionicons name="backspace-outline" size={24} color={colors.textSecondary} />
            ) : (
              <Typography variant="amountSm" color={colors.textPrimary} style={styles.digit}>
                {key}
              </Typography>
            )}
          </Touchable>
        );
      })}
    </View>
  );
}

export interface PinDotsProps {
  /** Digits entered so far. */
  length: number;
  total?: number;
}

/**
 * The six PIN dots.
 *
 * Grouped for assistive tech and reporting how many are filled, but the digits
 * themselves are hidden — see the note on `Keypad`.
 */
export function PinDots({ length, total = PIN_LENGTH }: PinDotsProps) {
  const colors = useThemeStore((state) => state.colors);
  const filled = Math.min(length, total);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="PIN entry"
      accessibilityValue={{ min: 0, max: total, now: filled, text: `${filled} of ${total} digits entered` }}
      // Same gap as `aria-selected` in TabBar: react-native-web forwards
      // `accessibilityLabel` and the role, but drops the numeric part of
      // `accessibilityValue`, leaving the web build with a progressbar that
      // announced a label and no position. The ARIA attributes are passed
      // directly so both platforms get the full value.
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      aria-valuetext={`${filled} of ${total} digits entered`}
      style={styles.dotsRow}
    >
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dot, index < filled ? { backgroundColor: colors.primary } : { borderColor: colors.borderControl }]}
        />
      ))}
    </View>
  );
}

/** A key, exposed so screens can render their own layout if they need to. */
export function keypadKeyStyle() {
  return styles.key;
}

const styles = StyleSheet.create({
  keypad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: {
    width: '33.333%',
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  digit: { fontSize: 26, fontWeight: '600' },
  dotsRow: { flexDirection: 'row', gap: space.lg, justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 8, borderWidth: 1.5 },
});
