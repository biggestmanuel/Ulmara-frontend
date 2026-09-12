import { View, StyleSheet } from 'react-native';
import { Badge, LoadingSpinner } from '../ui';

type Status = 'processing' | 'complete' | 'failed';

interface TransactionStatusProps {
  status: Status;
}

const copy: Record<Status, { label: string; tone: 'neutral' | 'success' | 'danger' }> = {
  processing: { label: 'Processing', tone: 'neutral' },
  complete: { label: 'Complete', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function TransactionStatus({ status }: TransactionStatusProps) {
  return (
    <View style={styles.row}>
      {status === 'processing' ? <LoadingSpinner /> : null}
      <Badge label={copy[status].label} tone={copy[status].tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
