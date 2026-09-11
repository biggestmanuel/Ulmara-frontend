import { View, StyleSheet } from 'react-native';
import { Typography } from './Typography';
import { useThemeStore } from '../../lib/theme';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  label: string;
  tone?: Tone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const colors = useThemeStore((state) => state.colors);
  const toneColors = {
    neutral: { bg: colors.surfaceElevated, text: colors.textSecondary },
    success: { bg: `${colors.success}22`, text: colors.success },
    warning: { bg: `${colors.warning}22`, text: colors.warning },
    danger: { bg: `${colors.error}22`, text: colors.error },
  }[tone];

  return (
    <View style={[styles.base, { backgroundColor: toneColors.bg }]}> 
      <Typography variant="caption" color={toneColors.text}>{label}</Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
