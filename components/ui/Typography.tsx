import { Text, type TextProps } from 'react-native';

import { useThemeStore, type, tabularNums } from '../../lib/theme';

/**
 * Every piece of text in the app goes through here.
 *
 * ## Why a scale rather than per-screen `fontSize`
 *
 * The audit found **21 distinct font sizes** across 40 screens and only 19 uses
 * of the shared `Typography` primitive — most screens were writing their own
 * `fontSize`/`fontWeight` inline. That is why the app looked assembled rather
 * than designed: three different screens could each claim to have a "title", at
 * 17, 22 and 26.
 *
 * The eight steps in `lib/theme/tokens.ts` are now the only sizes that exist. If
 * a screen needs something that is not on the scale, that is a signal the design
 * is missing a step — not an invitation to invent a 19pt font.
 *
 * ## Variants
 *
 * | variant    | face   | use                                         |
 * |------------|--------|---------------------------------------------|
 * | `amount`   | serif  | the balance — the largest type in the app   |
 * | `amountSm` | sans   | amounts in rows and receipt totals          |
 * | `title`    | serif  | screen titles                               |
 * | `heading`  | serif  | section headings                            |
 * | `titleSm`  | sans   | row titles, button labels                   |
 * | `body`     | sans   | prose                                       |
 * | `label`    | sans   | form labels, secondary UI                   |
 * | `caption`  | sans   | metadata, timestamps, helper text           |
 * | `micro`    | sans   | badges, dense table headers                 |
 * | `code`     | mono   | addresses, hashes, seed phrases             |
 *
 * ## Numbers
 *
 * Pass `numeric` for anything that changes in place — balances, amounts, token
 * quantities, the Account ID. It applies tabular figures so the value does not
 * shift width as it ticks, which otherwise makes a live balance look unstable.
 */
export type TypographyVariant = keyof typeof type;

export interface TypographyProps extends TextProps {
  variant?: TypographyVariant;
  /** Overrides the theme's default text colour for this step. */
  color?: string;
  /** Tabular figures — for values that change in place. */
  numeric?: boolean;
}

export function Typography({
  variant = 'body',
  color,
  numeric = false,
  style,
  ...rest
}: TypographyProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <Text
      style={[type[variant], numeric ? tabularNums : null, { color: color ?? colors.textPrimary }, style]}
      {...rest}
    />
  );
}
