import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Typography } from './Typography';
import { IconButton } from './IconButton';
import { radius, space, useThemeStore } from '../../lib/theme';

/**
 * The Account ID, set the way it deserves to be set.
 *
 * ## This is the product
 *
 * Ulmara exists to replace a 42-character blockchain address with a 10-digit
 * number. Everything else in the app is infrastructure for that one idea. So
 * the ID is the app's signature typographic object, not a form field:
 *
 * - **tabular figures**, because the digits must sit in fixed columns and never
 *   shift as you read them or as the app re-renders;
 * - **wide letter-spacing**, which groups a run of digits into readable chunks
 *   the way a bank reference number is presented;
 * - **a real size**, because this is the one string in the product that a user
 *   reads aloud, types into a support chat, and checks character by character.
 *
 * The previous design presented it as `9943 192 594` in white on a saturated
 * card with a translucent white "copy" pill — a treatment that could only ever
 * work on a coloured fill, and which therefore locked the whole hero component
 * into one colourway. Here it is plain ink on the page, so it belongs to the
 * document rather than to a card.
 */
export interface AccountIdProps {
  /** Raw 10 digits, or already grouped. Both are formatted for display. */
  value: string;
  /** `hero` for the profile's own ID; `inline` for a counterparty's. */
  size?: 'hero' | 'inline';
  /** Shows the copy control. Off when the ID is already being copied. */
  onCopy?: () => void;
  label?: string;
}

/** Groups a digit run into `4 3 3`, matching how the app writes it everywhere. */
export function formatAccountId(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean.length !== 10) return digits;
  return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
}

export function AccountId({ value, size = 'hero', onCopy, label = 'Account ID' }: AccountIdProps) {
  const colors = useThemeStore((state) => state.colors);
  const formatted = formatAccountId(value);
  const hero = size === 'hero';

  return (
    <View style={styles.wrapper}>
      <Typography variant="micro" color={colors.textMuted}>
        {label.toUpperCase()}
      </Typography>

      <View style={styles.row}>
        <Typography
          // The ID is a number, so it gets the numeric treatment even though it
          // is set in the sans face — tabular figures are about alignment, not
          // about typeface.
          variant={hero ? 'title' : 'titleSm'}
          numeric
          accessibilityLabel={`Account ID ${formatted.split(' ').join(' ')}`}
          style={styles.value}
        >
          {formatted}
        </Typography>

        {onCopy ? (
          <IconButton
            accessibilityLabel="Copy Account ID"
            accessibilityHint="Copies your Account ID to the clipboard"
            onPress={onCopy}
            variant="filled"
            style={styles.copy}
          >
            <Ionicons name="copy-outline" size={17} color={colors.textSecondary} />
          </IconButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  value: { letterSpacing: 1.2 },
  copy: { borderRadius: radius.chip },
});
