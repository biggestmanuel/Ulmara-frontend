import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/theme';

export function LoadingSpinner({ size = 'small' as 'small' | 'large' }) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, alignItems: 'center', justifyContent: 'center' },
});
