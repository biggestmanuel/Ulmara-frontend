import { View, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Typography } from '../ui';
import { useThemeStore } from '../../lib/theme';

interface QRDisplayProps {
  value: string;
  accountId: string;
  size?: number;
}

export function QRDisplay({ value, accountId, size = 220 }: QRDisplayProps) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View style={styles.wrapper}>
      <View style={[styles.qrBox, { backgroundColor: colors.surface }]}>
        <QRCode value={value} size={size} />
      </View>
      <Typography variant="label">{accountId}</Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 16 },
  qrBox: { padding: 20, borderRadius: 20, backgroundColor: '#fff' },
});
