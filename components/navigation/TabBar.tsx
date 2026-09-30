import { StyleSheet, View } from 'react-native';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { Touchable } from '../../lib/hooks/usePressScale';
import { Typography } from '../ui';
import { radius, space, useThemeStore } from '../../lib/theme';

export interface TabItem {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}

export interface TabBarProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Renders a single filled item in the centre. `send` in Ulmara. */
  primaryKey?: string;
  onPrimaryPress?: () => void;
}

/**
 * The tab bar.
 *
 * ## What changed, and why
 *
 * The previous bar was a **floating pill** — a rounded container with
 * `shadowOpacity: 0.16`, `radius: 18`, sitting inset from the screen edges, with
 * a 64pt Send button raised out of it by `marginTop: -28` and carrying
 * `elevation: 12`. That silhouette is the iOS 2015-era pattern, and it is
 * copied by a very large number of crypto and fintech apps, which is a large part
 * of why the product looked generic.
 *
 * This version is a **flat bar pinned to the bottom edge**, separated by a single
 * hairline, with the five destinations as equal-weight items. The primary action
 * keeps its position in the sequence (between Transactions and Balances) so no
 * navigation is lost, but it is expressed with the same accent fill as every
 * other primary button in the app rather than as a floating lozenge — which
 * makes Send read as "the same kind of action as the other primaries" instead of
 * as a special mode.
 *
 * ## Accessibility
 *
 * Each tab is a real button that reports `selected`. The raised Send item
 * previously had a label and a role but **no `selected` state**, so a screen
 * reader could not tell whether Send was current. All five now report it.
 */
export function TabBar({ tabs, activeKey, onChange, primaryKey, onPrimaryPress }: TabBarProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.border }]}
    >
      {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        const isPrimary = tab.key === primaryKey;

        return (
          <Touchable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            // `accessibilityState.selected` is the native mechanism, but
            // react-native-web does not translate it into `aria-selected`, so a
            // screen reader on the web build had no way to tell which tab was
            // current. Passing the ARIA attribute directly covers both.
            aria-selected={selected}
            accessibilityHint={isPrimary ? 'Opens the send flow' : undefined}
            onPress={() => (isPrimary && onPrimaryPress ? onPrimaryPress() : onChange(tab.key))}
            pressScale={0.92}
            style={styles.tab}
          >
            <View
              style={[
                styles.glyph,
                isPrimary ? { backgroundColor: colors.primary } : null,
                selected && !isPrimary ? { backgroundColor: colors.primaryLight } : null,
              ]}
            >
              <Ionicons
                name={tab.icon}
                size={isPrimary ? 20 : 19}
                color={isPrimary ? colors.onPrimary : selected ? colors.primary : colors.textMuted}
              />
            </View>

            <Typography
              variant="micro"
              color={isPrimary ? colors.textPrimary : selected ? colors.primary : colors.textMuted}
              numberOfLines={1}
            >
              {tab.label}
            </Typography>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingBottom: space.sm },
  // 34x30 keeps the icon legible while leaving room for the label beneath, and
  // makes the selected state a quiet tint rather than a second filled shape.
  glyph: {
    width: 34,
    height: 30,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
