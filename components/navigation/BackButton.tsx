import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Typography } from '../ui';
import { useThemeStore } from '../../lib/theme';

export function BackButton() {
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => router.back()}
      hitSlop={12}
    >
      <Typography variant="h3" color={colors.textPrimary}>{'‹'}</Typography>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
