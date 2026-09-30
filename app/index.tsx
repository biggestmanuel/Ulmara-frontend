import { StyleSheet, View } from 'react-native';

import { LoadingSpinner } from '../components/ui';
import { useThemeStore } from '../lib/theme';

/**
 * Transient redirect placeholder.
 *
 * This renders only in the brief window between `SplashScreen.hideAsync()` and
 * the redirect firing in `app/_layout.tsx`, so it should never be on screen for
 * long. It exists to stop the navigation resolving to nothing.
 *
 * The one change: the raw `ActivityIndicator` had no colour, so it took the
 * platform default and matched nothing else in the app. A blank frame is the
 * correct behaviour here; a spinner in an arbitrary colour is a visible
 * flicker. It is now the shared `LoadingSpinner`, which reads the theme.
 */
export default function Index() {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LoadingSpinner size="large" label="Starting Ulmara" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
