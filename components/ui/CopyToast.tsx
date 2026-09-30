import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { Typography } from './Typography';
import { useReducedMotion } from '../../lib/hooks/useReducedMotion';
import { radius, space, useThemeStore } from '../../lib/theme';

/**
 * Clipboard feedback.
 *
 * ## What changed
 *
 * The old toast was a **blocking modal**: `Modal` + a full-screen `Pressable`
 * that dimmed everything and swallowed a tap. Copying your own Account ID is a
 * routine, near-invisible act — interrupting the whole screen for 1.6 seconds
 * to say "copied" is disproportionate, and the dim overlay made the app feel
 * like it was blocking. This is now a small floating pill near the bottom that
 * does not intercept touches.
 *
 * ## Accessibility
 *
 * It is a live region, so a screen-reader user is told the copy succeeded
 * without losing their place. Critically, it is rendered as a toast rather than
 * a dialog: it takes no focus, so focus is not stolen from whatever the user
 * was actually doing.
 */
export function useCopyToast() {
  const [label, setLabel] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copyToClipboard = async (text: string, message = 'Copied to clipboard') => {
    await Clipboard.setStringAsync(text);
    setLabel(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLabel(null), 1600);
  };

  return { copyToClipboard, message: label, visible: label !== null };
}

export function CopyToast({ message, visible }: { message: string; visible: boolean }) {
  const colors = useThemeStore((state) => state.colors);
  // Honoured so the toast still appears — it carries information — but without
  // the modal fade when motion is reduced.
  const reducedMotion = useReducedMotion();

  if (!visible || !message) return null;

  return (
    <Modal
      visible={visible}
      transparent
      // "none" when motion is reduced; the content is still announced.
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View style={styles.layer} pointerEvents="none">
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={message}
          style={[styles.pill, { backgroundColor: colors.textPrimary }]}
        >
          <Ionicons name="checkmark" size={14} color={colors.background} />
          <Typography variant="label" color={colors.background}>
            {message}
          </Typography>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 120 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
  },
});
