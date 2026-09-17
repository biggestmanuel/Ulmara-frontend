import { View, ViewProps, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/theme';

export function Card({ style, ...rest }: ViewProps) {
  const colors = useThemeStore((state) => state.colors);
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
});
