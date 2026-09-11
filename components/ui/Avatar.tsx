import { View, Image, StyleSheet } from 'react-native';
import { Typography } from './Typography';
import { useThemeStore } from '../../lib/theme';

interface AvatarProps {
  uri?: string | null;
  fallbackInitial?: string;
  size?: number;
}

export function Avatar({ uri, fallbackInitial = '?', size = 44 }: AvatarProps) {
  const colors = useThemeStore((state) => state.colors);
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension]} />;
  }
  return (
    <View style={[styles.fallback, { backgroundColor: colors.primaryLight }, dimension]}>
      <Typography variant="label">{fallbackInitial.toUpperCase()}</Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#EEE' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
