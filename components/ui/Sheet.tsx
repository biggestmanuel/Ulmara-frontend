import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Typography } from './Typography';
import { IconButton } from './IconButton';
import { Ionicons } from '@expo/vector-icons';
import { radius, space, useThemeStore } from '../../lib/theme';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Secondary line under the title. */
  subtitle?: string;
  children: ReactNode;
  /** Pinned to the bottom, outside the scroll area. */
  footer?: ReactNode;
  /** Called when the backdrop is tapped. Defaults to `onClose`. */
  onBackdropPress?: () => void;
}

/**
 * Bottom sheet.
 *
 * ## Accessibility
 *
 * This wraps React Native's `Modal`, which on iOS maps to an actual
 * accessibility-modal container and on Android to a focus-trapping dialog, so
 * the hardware back button and screen readers both behave. Two things the raw
 * `Modal` did not give us are added here:
 *
 * - the close control is an `IconButton`, so it has a name ("Close") and a 44pt
 *   target instead of being a bare glyph;
 * - the sheet itself is labelled by its title, so a screen reader announces
 *   what just appeared.
 *
 * The backdrop is a `Pressable` with a matching label, which also makes
 * backdrop-dismiss discoverable rather than an invisible affordance.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer, onBackdropPress }: SheetProps) {
  const colors = useThemeStore((state) => state.colors);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityHint="Dismisses this panel"
          onPress={onBackdropPress ?? onClose}
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        />

        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, space.xl) },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Typography variant="heading" numberOfLines={1}>
                {title}
              </Typography>
              {subtitle ? (
                <Typography variant="caption" color={colors.textMuted} style={styles.subtitle}>
                  {subtitle}
                </Typography>
              ) : null}
            </View>
            <IconButton accessibilityLabel="Close" onPress={onClose} size={40}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </IconButton>
          </View>

          <View style={styles.body}>{children}</View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    maxHeight: '88%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.lg,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerText: { flex: 1 },
  subtitle: { marginTop: space.xs },
  body: { paddingTop: space.xl },
  footer: { paddingTop: space.xl, gap: space.md },
});
