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
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});

function getVariantStyle(variant: Variant, colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  if (variant === 'primary') {
    return {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    };
  }
  if (variant === 'secondary') {
    return {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    };
  }
  if (variant === 'destructive') return { backgroundColor: colors.error };
  return styles.ghost;
}
