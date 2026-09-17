import { View, StyleSheet } from 'react-native';
import { Typography } from '../ui';
import { BackButton } from './BackButton';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export function Header({ title, showBack, right }: HeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>{showBack ? <BackButton /> : null}</View>
      {title ? <Typography variant="h3">{title}</Typography> : null}
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  side: { width: 44 },
  right: { alignItems: 'flex-end' },
});
