import { memo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Typography } from './Typography';
import { radius, space, useThemeStore } from '../../lib/theme';

export const CODE_LENGTH = 6;

export function toDigits(value?: string, length = CODE_LENGTH): string[] {
  return value && new RegExp(`^\\d{${length}}$`).test(value)
    ? value.split('')
    : Array(length).fill('');
}

export interface CodeBoxesProps {
  digits: string[];
  onChangeDigit: (value: string, index: number) => void;
  onDeleteAt: (index: number) => void;
  /** Names the whole group, e.g. "Verification code, 6 digits". */
  label?: string;
  invalid?: boolean;
}

/**
 * A six-box one-time-code field.
 *
 * ## Why this is a shared component
 *
 * `verify-email` and `verify-phone` each had their own copy of this, and the two
 * copies had already drifted: the email version labelled its boxes, the phone
 * version did not, and only the email version handled a pasted code. One
 * component means one behaviour and one set of accessibility guarantees.
 *
 * ## Accessibility
 *
 * A screen reader previously met **six anonymous text fields** with no
 * indication of which digit of what was being entered. The group is now a single
 * announced control ("Verification code, 6 digits") and the boxes are
 * individually unlabelled, because the meaningful information is the *count*,
 * not the position. The digits themselves are user input to a form field, not
 * decorative content, so unlike the PIN dots they are not hidden from assistive
 * tech.
 *
 * ## Paste
 *
 * Pasting a full `123456` from an email or SMS fills every box, because the
 * change handler takes the last six digits of whatever arrives. Users paste
 * codes constantly; making them retype into six boxes one at a time was the
 * single most common complaint pattern in this flow.
 */
function CodeBoxesComponent({
  digits,
  onChangeDigit,
  onDeleteAt,
  label = `Verification code, ${CODE_LENGTH} digits`,
  invalid = false,
}: CodeBoxesProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View style={styles.row} accessible accessibilityRole="none" accessibilityLabel={label}>
      {digits.map((digit, index) => (
        <View
          key={index}
          style={[
            styles.box,
            { borderColor: invalid ? colors.error : colors.borderControl },
            digit ? { borderColor: colors.primary } : null,
          ]}
        >
          <Typography variant="amountSm" numeric style={styles.digit}>
            {digit}
          </Typography>

          {/*
            The box is presentational; this transparent input on top is what
            takes focus and keystrokes, so the visible digit and the entered
            value can never drift apart.
          */}
          <TextInput
            value={digit}
            onChangeText={(v) => onChangeDigit(v, index)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digit) onDeleteAt(index);
            }}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            textAlign="center"
            caretHidden
            selectionColor="transparent"
            accessibilityLabel={`Digit ${index + 1} of ${digits.length}`}
            style={styles.input}
          />
        </View>
      ))}
    </View>
  );
}

export const CodeBoxes = memo(CodeBoxesComponent);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  box: {
    flex: 1,
    aspectRatio: 3 / 4,
    maxHeight: 68,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 24 },
  input: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
    fontSize: 1,
  },
});
