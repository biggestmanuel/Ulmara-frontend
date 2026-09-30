import { StyleSheet, View } from 'react-native';

import { useThemeStore } from '../../lib/theme';

/**
 * A hairline rule.
 *
 * `StyleSheet.hairlineWidth` so it renders as a true 1px line on every density
 * rather than as a chunky 1dp border that looks heavy on a 3x screen.
 */
export function Divider() {
  const colors = useThemeStore((state) => state.colors);
  return <View style={[styles.line, { backgroundColor: colors.divider }]} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, width: '100%' },
});
