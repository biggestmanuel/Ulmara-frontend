import { StyleSheet } from 'react-native';
import { Card, Typography } from '../ui';

interface BalanceCardProps {
  totalUsdValue: string;
  accountId: string;
  hidden?: boolean;
}

export function BalanceCard({ totalUsdValue, accountId, hidden }: BalanceCardProps) {
  return (
    <Card style={styles.card}>
      <Typography variant="caption">Account ID: {accountId}</Typography>
      <Typography variant="h1" style={styles.balance}>
        {hidden ? '••••••' : totalUsdValue}
      </Typography>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  balance: { marginTop: 4 },
});
