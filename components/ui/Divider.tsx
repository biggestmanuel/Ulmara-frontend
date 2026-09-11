import { View, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/theme';

export function Divider() {
  const colors = useThemeStore((state) => state.colors);
  return <View style={[styles.line, { backgroundColor: colors.divider }]} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, width: '100%' },
});
