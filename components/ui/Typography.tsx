import { Text, TextProps, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/theme';

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';

interface TypographyProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export function Typography({ variant = 'body', color, style, ...rest }: TypographyProps) {
  const defaultColor = useThemeStore((state) => state.colors.textPrimary);
  return <Text style={[styles[variant], { color: color ?? defaultColor }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  h1: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  h2: { fontSize: 23, fontWeight: '800', letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  bodySmall: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400', opacity: 0.6 },
  label: { fontSize: 13, fontWeight: '600' },
});
