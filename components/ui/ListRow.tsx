import type { ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { Typography } from './Typography';
import { IconButton } from './IconButton';
import { Touchable } from '../../lib/hooks/usePressScale';
import { space, useThemeStore } from '../../lib/theme';

export interface ListRowAction {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}

export interface ListRowProps {
  /** Leading glyph, initials, or an icon element. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  /** Trailing slot — an amount, a status, or trailing actions. */
  trailing?: ReactNode;
  /** Draws a hairline underneath. Omit on the last row of a group. */
  showSeparator?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * Selection / busy / disabled state.
   *
   * Forwarded because a `ListRow` is frequently the *only* control in a
   * single-choice group (settings, currency and language pickers). Without it
   * those rows are just unlabelled pressables and a screen reader cannot tell
   * which option is current — which is the whole point of a single-choice
   * control.
   */
  accessibilityState?: AccessibilityState;
  /**
   * `aria-selected` for the web build.
   *
   * react-native-web does not translate `accessibilityState.selected` into
   * `aria-selected`; see the same note in `SegmentedControl` and `TabBar`.
   */
  'aria-selected'?: boolean;
  /** Icon buttons rendered below the row. */
  actions?: ListRowAction[];
  disabled?: boolean;
}

/**
 * A row in a list.
 *
 * ## What changed
 *
 * The app previously wrapped whole lists in a bordered card and put a divider
 * between every row inside it, so a simple list of contacts or transactions read
 * as a dense stack of boxed items with double borders. This puts the hairline
 * *between* rows and leaves the group's outer edges open — the convention of a
 * printed list, using a third of the ink.
 *
 * It also standardises the two things rows kept getting wrong:
 *
 * - **Leading avatar**: the old `Avatar` had a hardcoded purple border
 *   (`rgba(99,91,255,0.18)`) and a hardcoded `#EEE` fallback, so it did not
 *   respond to the theme at all. Initials now derive their colour from the
 *   accent, which is the app's only chromatic decision.
 * - **Actions**: per-row icon buttons (send / edit / delete) are declared as
 *   data so each one gets a real accessible name automatically. That was the
 *   single largest accessibility gap in the app.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  showSeparator = true,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  actions = [],
  disabled = false,
}: ListRowProps) {
  const colors = useThemeStore((state) => state.colors);

  const content = (
    <>
      {leading ? <View>{leading}</View> : null}

      <View style={styles.body}>
        <Typography variant="titleSm" numberOfLines={1}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography
            variant="caption"
            color={colors.textMuted}
            numberOfLines={1}
            style={styles.subtitle}
          >
            {subtitle}
          </Typography>
        ) : null}
      </View>

      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}

      {/*
        A row that reports `selected` is a *choice*, not a navigation step, so
        it is a radio and it is marked with a tick. Every other pressable row is
        a link and gets a chevron. Showing a chevron on a radio is the same
        mismatch as labelling a tablist "radio": the affordance tells the user
        to expect a new screen and there is no new screen.
      */}
      {accessibilityState?.selected === undefined && onPress && actions.length === 0 ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      ) : null}
    </>
  );

  const isChoice = accessibilityState?.selected !== undefined;

  return (
    <View style={styles.wrapper}>
      {onPress ? (
        <Touchable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole={isChoice ? 'radio' : 'button'}
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityHint={accessibilityHint}
          accessibilityState={accessibilityState}
          aria-selected={accessibilityState?.selected}
          pressScale={0.995}
          style={styles.row}
        >
          {content}
        </Touchable>
      ) : (
        <View style={styles.row}>{content}</View>
      )}

      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <IconButton key={action.label} accessibilityLabel={action.label} onPress={action.onPress}>
              <Ionicons name={action.icon} size={18} color={colors.textSecondary} />
            </IconButton>
          ))}
        </View>
      ) : null}

      {showSeparator ? <View style={[styles.separator, { backgroundColor: colors.divider }]} /> : null}
    </View>
  );
}

/** A circular initials badge. Colour comes from the accent, not a hardcoded tint. */
export function InitialsAvatar({
  initials,
  size = 42,
  tone = 'primary',
}: {
  initials: string;
  size?: number;
  tone?: 'primary' | 'neutral';
}) {
  const colors = useThemeStore((state) => state.colors);
  const background = tone === 'primary' ? colors.primaryLight : colors.surfaceElevated;
  const color = tone === 'primary' ? colors.primary : colors.textSecondary;

  return (
    <View
      accessibilityElementsHidden
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}
    >
      <Typography variant="label" color={color}>
        {initials.slice(0, 1).toUpperCase()}
      </Typography>
    </View>
  );
}

export function RowDivider() {
  const colors = useThemeStore((state) => state.colors);
  return <View style={[styles.separator, { backgroundColor: colors.divider }]} />;
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  body: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 2 },
  trailing: { alignItems: 'flex-end' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  actions: { flexDirection: 'row', gap: space.xs, justifyContent: 'flex-end', paddingBottom: space.sm },
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
