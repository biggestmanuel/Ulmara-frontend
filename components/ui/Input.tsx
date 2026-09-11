import { View, TextInput, TextInputProps, StyleSheet } from 'react-native';
import { Typography } from './Typography';
import { useThemeStore } from '../../lib/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  const { colors } = useThemeStore();
  return (
    <View style={styles.wrapper}>
      {label ? <Typography variant="label" style={styles.label}>{label}</Typography> : null}
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border, color: colors.textPrimary }, style]}
        placeholderTextColor={colors.textMuted}
        {...rest}
      />
      {error ? <Typography variant="caption" color={colors.error}>{error}</Typography> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { marginBottom: 2 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
});
