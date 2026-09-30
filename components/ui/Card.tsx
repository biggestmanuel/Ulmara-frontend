import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

import { radius, space, useThemeStore } from '../../lib/theme';

export interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
  /** Removes the internal padding for rows that manage their own. */
  flush?: boolean;
  /** Draws no border — for cards sitting on an already-distinct surface. */
  borderless?: boolean;
}

/**
 * A flat content group.
 *
 * ## What changed
 *
 * The old `Card` carried `shadowOpacity: 0.06`, `shadowRadius: 18` and
 * `elevation: 2` on **every** instance, at a 22pt radius. Stacking a dozen of
 * those produced the mushy, over-decorated look the redesign is removing:
 * shadows on many small surfaces read as noise, because a shadow's job is to
 * communicate that one thing floats above another, and once everything floats,
 * nothing does.
 *
 * The new card is a **surface with a hairline border**. Separation comes from
 * the 1pt rule and the difference between `surface` and `background`, which is
 * how a printed page separates a boxed figure from the paper around it. The
 * radius drops from 22 to 16 to sit on the same scale as everything else.
 */
export function Card({ style, flush = false, borderless = false, ...rest }: CardProps) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: borderless ? 'transparent' : colors.border,
        },
        flush ? styles.flush : styles.padded,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
  },
  padded: { padding: space.xl },
  flush: { padding: 0, overflow: 'hidden' },
});
