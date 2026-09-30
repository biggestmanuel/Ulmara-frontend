import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { Typography } from './Typography';
import { Button } from './Button';
import { radius, space, useThemeStore } from '../../lib/theme';

export interface EmptyStateProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  /** One sentence. Explains what would fill this space, not what went wrong. */
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * The empty state.
 *
 * Deliberately **not** a card. The previous empty states were centred 12pt grey
 * lines floating inside a bordered box, which read as an error rather than as a
 * normal starting point. This is a glyph, a short line of copy, and — where
 * there is genuinely somewhere to go — a single action. Flat, centred, calm.
 *
 * `body` is optional on purpose: an empty list with a heading and nothing else
 * is a complete, honest state, and padding it with explanatory prose is the
 * thing that makes empty states feel apologetic.
 */
export function EmptyState({ icon, title, body, actionLabel, onAction }: EmptyStateProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View style={styles.wrapper} accessibilityRole="summary">
      <View style={[styles.glyph, { borderColor: colors.border }]}>
        <Ionicons name={icon} size={26} color={colors.textMuted} />
      </View>

      <Typography variant="titleSm" style={styles.title}>
        {title}
      </Typography>

      {body ? (
        <Typography variant="body" color={colors.textMuted} style={styles.body}>
          {body}
        </Typography>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="sm"
          fullWidth={false}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', marginTop: space.sm, maxWidth: 300 },
  action: { marginTop: space.xl },
});
