import { useState } from 'react';
import { View, TextInput, TextInputProps, StyleSheet } from 'react-native';
import { Typography } from './Typography';
import { useThemeStore } from '../../lib/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, onFocus, onBlur, ...rest }: InputProps) {
  const { colors } = useThemeStore();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Typography variant="label" style={[styles.label, { color: colors.textSecondary }]}>
          {label}
        </Typography>
      ) : null}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.error : isFocused ? colors.primary : colors.border,
            color: colors.textPrimary,
          },
          style,
        ]}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error ? <Typography variant="caption" color={colors.error}>{error}</Typography> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { marginBottom: 2, fontWeight: '600' },
  input: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
});
