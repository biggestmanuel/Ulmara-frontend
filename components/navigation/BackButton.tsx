import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { IconButton } from '../ui';
import { useThemeStore } from '../../lib/theme';

/**
 * The back affordance.
 *
 * ## What changed
 *
 * The previous version was a bare `Pressable` with **no `accessibilityRole`, no
 * `accessibilityLabel` and no visible icon** — it rendered a literal `‹`
 * character as a `titleSm` text node inside a 38pt circle. To a screen reader it
 * announced as an unlabelled element; to anyone with a motor or vision
 * disability the `‹` glyph at text size was the smallest target in the app, and
 * it was below the 44pt minimum.
 *
 * Now it is an `IconButton` (44pt by default, named, with a real Ionicons
 * chevron) and the press feedback is on the UI thread.
 */
export function BackButton({ onPress, label = 'Go back' }: { onPress?: () => void; label?: string }) {
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);

  return (
    <IconButton
      accessibilityLabel={label}
      accessibilityHint="Returns to the previous screen"
      onPress={onPress ?? (() => router.back())}
      pressScale={0.9}
      style={styles.btn}
    >
      <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  // Pulled slightly outside the gutter so the icon optically aligns with the
  // page edge while the touch target still overlaps the text column.
  btn: { marginLeft: -10 },
});
