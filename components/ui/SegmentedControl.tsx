import { StyleSheet, View } from 'react-native';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { Typography } from './Typography';
import { Touchable } from '../../lib/hooks/usePressScale';
import { controlHeight, radius, space, useThemeStore } from '../../lib/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Optional trailing count, e.g. the number of assets in a filter. */
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Announces the group, e.g. "Asset type". */
  accessibilityLabel: string;
}

/**
 * A segmented control.
 *
 * Replaces the ad-hoc chip rows the app used for the transfer-type choice, the
 * asset picker, the All/Native/Tokens filter and the transaction filters. All
 * four were separately implemented, separately rounded, and separately
 * accessible — three of them reported selection with a fill colour only.
 *
 * ## Why a segmented control rather than chips
 *
 * These are mutually exclusive choices within one dimension, and the options
 * are few. A segmented control says "pick exactly one of these" in a way a
 * wrapping chip row does not, and it keeps the labels on one line, which matters
 * for options like "Transfer to Ulmara" versus "Transfer to external wallet".
 *
 * ## Accessibility
 *
 * The group is announced as a tab list and each option as a tab with
 * `selected`, which is what VoiceOver and TalkBack expect for this control and
 * what makes "which one am I on?" answerable without seeing the fill colour.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.surfaceElevated }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Touchable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            // See the note in components/navigation/TabBar.tsx: react-native-web
            // does not translate accessibilityState.selected into
            // `aria-selected`, so pass the ARIA attribute explicitly too.
            aria-selected={selected}
            disabled={disabled}
            pressScale={0.98}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected ? { backgroundColor: colors.surface } : null,
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={15}
                color={selected ? colors.primary : colors.textMuted}
                style={styles.icon}
              />
            ) : null}

            <Typography
              variant="label"
              color={selected ? colors.textPrimary : colors.textMuted}
              numberOfLines={1}
              style={styles.label}
            >
              {option.label}
            </Typography>

            {option.count !== undefined ? (
              <Typography variant="micro" color={colors.textMuted}>
                {String(option.count)}
              </Typography>
            ) : null}
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.control,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: controlHeight - 10,
    borderRadius: radius.control - 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    gap: space.xs,
  },
  icon: { marginRight: 2 },
  label: { flexShrink: 1 },
});
