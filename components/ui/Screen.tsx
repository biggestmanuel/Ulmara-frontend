import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Typography } from './Typography';
import { contentMaxWidth, gutter, space, useThemeStore } from '../../lib/theme';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wraps the content in a `ScrollView`. Off for screens that own a list. */
  scroll?: boolean;
  /** Extra bottom padding — pass the tab bar height on tab screens. */
  bottomInset?: number;
  /** Centres content vertically. Used by the single-purpose auth screens. */
  center?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The page frame every screen sits in.
 *
 * ## Why this exists
 *
 * The audit found screen gutters ranging from 18 to 28px, each screen rolling
 * its own `SafeAreaView` + `ScrollView` + padding combination, and no maximum
 * width anywhere. On a tablet or in landscape the result is a single column of
 * text stretched across 900px, which is unreadable.
 *
 * This centralises three decisions:
 *
 * - the gutter (`space.xl`, 24) — wide enough to read as a page, narrow enough
 *   to stay a comfortable one-handed column;
 * - a `contentMaxWidth` so prose never becomes a long line on a large screen,
 *   with the block centred;
 * - the standard bottom padding, so the primary action on an auth screen is
 *   always thumb-reachable rather than wherever the content happened to end.
 *
 * It also gives the app its most important structural habit: **content is a
 * single centred column, not a grid of cards.** The previous design pushed most
 * screens into card stacks; this keeps them flat against the page.
 */
export function Screen({
  children,
  scroll = true,
  bottomInset = 0,
  center = false,
  style,
  contentStyle,
  testID,
}: ScreenProps) {
  const colors = useThemeStore((state) => state.colors);
  const { width } = useWindowDimensions();
  const horizontalPadding = width > contentMaxWidth ? (width - contentMaxWidth) / 2 : 0;

  const column = (
    <View
      style={[
        styles.column,
        { paddingHorizontal: gutter + horizontalPadding },
        center ? styles.center : null,
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: colors.background }, style]}
      testID={testID}
    >
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            center ? styles.center : null,
            { paddingBottom: space.xxxl + bottomInset },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {column}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingBottom: bottomInset }]}>{column}</View>
      )}
    </SafeAreaView>
  );
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Rendered on the trailing edge — usually icon buttons. */
  right?: React.ReactNode;
  /** Rendered on the leading edge, replacing the title block (e.g. a back button). */
  left?: React.ReactNode;
}

/**
 * Screen title block.
 *
 * Titles use `type.title` — the serif step — which is the clearest single
 * marker that this is a financial product rather than a dashboard. A one-line
 * title with an optional subtitle is the whole header: there is no second
 * navigation bar, because the tab bar or a back control already provides that.
 */
export function ScreenHeader({ title, subtitle, right, left }: ScreenHeaderProps) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View style={styles.header}>
      {left ? <View style={styles.headerSide}>{left}</View> : null}
      <View style={styles.headerText}>
        <Typography variant="title" numberOfLines={1}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="caption" color={colors.textMuted} style={styles.headerSubtitle}>
            {subtitle}
          </Typography>
        ) : null}
      </View>
      {right ? <View style={styles.headerSide}>{right}</View> : null}
    </View>
  );
}

/** Small label used above grouped content. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <Typography variant="micro" color={colors.textMuted} style={styles.sectionLabel}>
      {children}
    </Typography>
  );
}

/** A hairline rule, optionally inset from the page edges. */
export function Rule({ inset = false }: { inset?: boolean }) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View
      style={[
        styles.rule,
        { backgroundColor: colors.divider },
        inset ? { marginHorizontal: space.xl } : null,
      ]}
    />
  );
}

/** Vertical gap between page sections, on the spacing scale. */
export function Gap({ size = space.xl }: { size?: number }) {
  return <View style={{ height: size }} />;
}

/**
 * Bottom-anchored action area.
 *
 * Used on the auth screens so the primary action is always in the same place
 * regardless of how much copy sits above it — the one-handed rule from the
 * design brief, applied structurally rather than per screen.
 */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.actionBar}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  column: { flexGrow: 1 },
  center: { justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  headerText: { flex: 1 },
  headerSide: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerSubtitle: { marginTop: space.xs },

  sectionLabel: { marginBottom: space.md, letterSpacing: 1 },

  rule: { height: StyleSheet.hairlineWidth, width: '100%' },

  actionBar: { paddingTop: space.xxl, gap: space.md },
});
