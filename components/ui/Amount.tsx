import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Typography } from './Typography';
import { space, useThemeStore } from '../../lib/theme';

export interface AmountProps {
  /** The number, already formatted for display. */
  value: string;
  /** Ticker, rendered smaller and quieter. */
  symbol?: string;
  /** Renders at the largest size — the balance on Home. */
  size?: 'hero' | 'sm';
  /**
   * Direction of movement. `in` gets the success colour, `out` stays in ink
   * (spending money is not an error) and `none` is neutral.
   *
   * Colour is never the only signal: the direction is always paired with a
   * leading arrow glyph, so the meaning survives for a colour-blind user and in
   * a screen reader.
   */
  direction?: 'in' | 'out' | 'none';
  /** Secondary line, e.g. the fiat equivalent. */
  secondary?: string;
  /** Muted styling for a zero balance. */
  muted?: boolean;
}

/**
 * A money value.
 *
 * ## Typography is the feature
 *
 * In a wallet the amount *is* the content. So this primitive does three things
 * the old ad-hoc amounts did not:
 *
 * 1. **Tabular figures.** Every amount in this app either ticks live (balances,
 *    prices) or sits in a column next to other amounts. With proportional
 *    figures both cases visibly jitter. `numeric` is on by default here.
 * 2. **One size ladder.** `hero` is the Home balance in the serif display step;
 *    `sm` is the sans step used in rows and receipt totals. Previously the app
 *    had 34, 32, 30, 28, 24, 22, 20 and 19pt numbers, all meaning roughly
 *    "an amount".
 * 3. **Direction without colour-only meaning.** An arrow glyph always
 *    accompanies the tint.
 */
export function Amount({
  value,
  symbol,
  size = 'sm',
  direction = 'none',
  secondary,
  muted = false,
}: AmountProps) {
  const colors = useThemeStore((state) => state.colors);
  const hero = size === 'hero';

  const tint = muted
    ? colors.textMuted
    : direction === 'in'
      ? colors.success
      : colors.textPrimary;

  const icon =
    direction === 'in' ? 'arrow-down' : direction === 'out' ? 'arrow-up' : undefined;

  return (
    <View style={hero ? styles.heroWrapper : styles.wrapper}>
      <View style={styles.row}>
        {icon ? (
          <Ionicons
            name={icon}
            size={hero ? 20 : 14}
            color={direction === 'in' ? colors.success : colors.textMuted}
            style={styles.icon}
          />
        ) : null}

        <Typography variant={hero ? 'amount' : 'amountSm'} numeric color={tint} numberOfLines={1}>
          {value}
        </Typography>

        {symbol ? (
          <Typography
            variant={hero ? 'titleSm' : 'label'}
            color={colors.textMuted}
            style={styles.symbol}
          >
            {symbol}
          </Typography>
        ) : null}
      </View>

      {secondary ? (
        <Typography variant="caption" color={colors.textMuted} style={styles.secondary}>
          {secondary}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 2 },
  heroWrapper: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  icon: { marginRight: space.xs, alignSelf: 'center' },
  symbol: { marginLeft: space.xs },
  secondary: { marginTop: space.xs },
});
