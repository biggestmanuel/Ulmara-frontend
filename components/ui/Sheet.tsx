import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useEffect, useRef, type ReactNode } from 'react';
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
 * the hardware back button and screen readers both behave. Three things the
 * raw `Modal` did not give us are added here:
 *
 * - the close control is an `IconButton`, so it has a name ("Close") and a 44pt
 *   target instead of being a bare glyph;
 * - the sheet itself is labelled by its title, so a screen reader announces
 *   what just appeared;
 * - **focus is moved into the sheet on open and returned to the trigger on
 *   close.** Without that, a keyboard or screen-reader user opens a dialog and
 *   focus stays behind it on the now-inert background, so their next keystroke
 *   goes somewhere they cannot see. That is the single most common way a modal
 *   becomes unusable without a mouse.
 *
 * The backdrop is a `Pressable` with a matching label, which also makes
 * backdrop-dismiss discoverable rather than an invisible affordance.
 *
 * ## Escape on web
 *
 * `Modal` only handles Escape via `onRequestClose`, which native maps to the
 * hardware back button and react-native-web maps to Escape. That is checked
 * rather than assumed, and a listener is attached as well so behaviour does not
 * depend on the platform's Modal implementation. Both routes call the same
 * `onClose`, so a dismissal is a dismissal.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer, onBackdropPress }: SheetProps) {
  const colors = useThemeStore((state) => state.colors);
  const insets = useSafeAreaInsets();

  // The element that had focus when the sheet opened, so it can be given back.
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  // The sheet panel, so focus can be moved into it on open.
  const sheetRef = useRef<View>(null);

  useEffect(() => {
    if (!visible) return;

    // Capture the trigger before focus moves into the sheet.
    const active = document.activeElement;
    restoreFocusTo.current = active instanceof HTMLElement ? active : null;

    // Move focus to the sheet itself so the next Tab lands inside it rather
    // than behind the modal. Deferred a frame: the sheet is mounted in the same
    // commit, so it is not focusable until it has actually rendered.
    const raf = requestAnimationFrame(() => {
      sheetRef.current?.focus();
    });

    // Escape, independent of how the platform's Modal implements back/close.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      // Give focus back to whatever opened the sheet.
      const target = restoreFocusTo.current;
        if (target instanceof HTMLElement) target.focus();
    };
    // `onClose` is intentionally omitted: re-running this on every render of a
    // parent that passes an inline arrow would refocus the sheet constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
          ref={sheetRef}
          accessible={false}
          focusable
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
            <IconButton accessibilityLabel="Close" onPress={onClose}>
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
