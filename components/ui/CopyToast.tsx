import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { useThemeStore } from '../../lib/theme';

// Copy confirmation styled after the logout confirmation modal (same dimmed
// overlay, rounded bordered surface card, and button treatment) so copy
// feedback matches the app's design language instead of a bare Alert.
// Auto-dismisses after a moment; the overlay tap also dismisses it.
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

export function CopyToast({ message, visible, onHide }: { message: string; visible: boolean; onHide: () => void }) {
  const { colors } = useThemeStore();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onHide}>
      <Pressable style={styles.overlay} onPress={onHide}>
        <View pointerEvents="box-none" style={styles.centerWrap}>
          <Pressable
            style={[styles.toastCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.checkBadge, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="checkmark" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.toastText, { color: colors.textPrimary }]} numberOfLines={2}>
              {message}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerWrap: { alignItems: 'center' },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  checkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
});
