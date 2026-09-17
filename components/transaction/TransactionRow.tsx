import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Typography } from '../ui';
import { TransactionStatus } from './TransactionStatus';
import { useThemeStore } from '../../lib/theme';

interface TransactionRowProps {
  direction: 'sent' | 'received';
  counterparty: string;
  amount: string;
  symbol: string;
  status: 'processing' | 'complete' | 'failed';
  timestamp: string;
  onPress?: () => void;
}

export function TransactionRow({
  direction,
  counterparty,
  amount,
  symbol,
  status,
  timestamp,
  onPress,
}: TransactionRowProps) {
  const { colors, isDark } = useThemeStore();
  const sign = direction === 'sent' ? '-' : '+';
  const isReceived = direction === 'received';

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: isReceived
                ? isDark ? '#1C2E24' : '#EAF7EE'
                : isDark ? '#2E1C1C' : '#FEECEC',
            },
          ]}
        >
          <Text style={{ fontSize: 16, color: isReceived ? colors.success : colors.error }}>
            {isReceived ? '↓' : '↑'}
          </Text>
        </View>
        <View style={styles.details}>
          <Typography variant="label">{isReceived ? 'From' : 'To'} {counterparty}</Typography>
          <Typography variant="caption" color={colors.textMuted}>{timestamp}</Typography>
        </View>
      </View>
      <View style={styles.right}>
        <Typography
          variant="body"
          style={{ fontWeight: '700' }}
          color={isReceived ? colors.success : colors.textPrimary}
        >
          {sign}{amount} {symbol}
        </Typography>
        <TransactionStatus status={status} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: { gap: 2, flex: 1 },
  right: { alignItems: 'flex-end', gap: 4 },
});
