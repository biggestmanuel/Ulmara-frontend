import { StyleSheet, View } from 'react-native';

import { Typography } from '../ui';
import { BackButton } from './BackButton';
import { useThemeStore } from '../../lib/theme';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

/**
 * Secondary-screen header: a back control, a title, and optional trailing
 * actions.
 *
 * ## What changed
 *
 * The old header reserved a fixed `width: 44` on both sides to keep the title
 * centred, which fights longer strings and wastes the space a title actually
 * needs. The title is now left-aligned and takes the free space — the convention
 * both platforms' own apps use, and easier to scan because the eye starts from
 * the same place on every screen.
 *
 * Height also went from a fixed 60 to padding-driven sizing, so a title with a
 * subtitle cannot clip.
 */
export function Header({ title, subtitle, showBack, right }: HeaderProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View style={styles.row}>
      {showBack ? <BackButton /> : null}

      <View style={styles.titles}>
        {title ? (
          <Typography variant="titleSm" numberOfLines={1}>
            {title}
          </Typography>
        ) : null}
        {subtitle ? (
          <Typography variant="caption" color={colors.textMuted} numberOfLines={1}>
            {subtitle}
          </Typography>
        ) : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  titles: { flex: 1, minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
