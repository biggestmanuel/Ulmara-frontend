import { Pressable, ActivityIndicator, StyleSheet, PressableProps } from 'react-native';
import { Typography } from './Typography';
import { useThemeStore } from '../../lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ label, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const { colors } = useThemeStore();
  const isDisabled = disabled || loading;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        getVariantStyle(variant, colors),
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style as any,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
          <ActivityIndicator color={variant === 'primary' || variant === 'destructive' ? '#FFFFFF' : colors.textPrimary} />
      ) : (
        <Typography variant="label" color={variant === 'primary' || variant === 'destructive' ? '#FFFFFF' : colors.textPrimary}>
          {label}
        </Typography>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});

function getVariantStyle(variant: Variant, colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  if (variant === 'primary') return { backgroundColor: colors.primary };
  if (variant === 'secondary') return { backgroundColor: colors.surfaceElevated };
  if (variant === 'destructive') return { backgroundColor: colors.error };
  return styles.ghost;
}
