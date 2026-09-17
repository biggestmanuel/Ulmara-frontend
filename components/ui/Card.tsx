import { View, ViewProps, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/theme';

export function Card({ style, ...rest }: ViewProps) {
  const colors = useThemeStore((state) => state.colors);
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
});
