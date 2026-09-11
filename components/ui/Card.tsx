import { View, ViewProps, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/theme';

export function Card({ style, ...rest }: ViewProps) {
  const colors = useThemeStore((state) => state.colors);
  return <View style={[styles.card, { backgroundColor: colors.surface }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
  },
});
