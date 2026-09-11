import { View, Pressable, StyleSheet } from 'react-native';
import { Typography, Badge } from '../ui';
import { useThemeStore } from '../../lib/theme';

export interface NetworkOption {
  id: string;
  label: string;
  estimatedFee: string;
  recommended?: boolean;
}

interface NetworkSelectorProps {
  options: NetworkOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function NetworkSelector({ options, selectedId, onSelect }: NetworkSelectorProps) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View style={styles.list}>
      {options.map((opt) => {
        const active = opt.id === selectedId;
        return (
          <Pressable
            key={opt.id}
            style={[styles.row, { borderColor: active ? colors.primary : colors.border }]}
            onPress={() => onSelect(opt.id)}
          >
            <View style={styles.left}>
              <Typography variant="label">{opt.label}</Typography>
              {opt.recommended ? <Badge label="Recommended" tone="success" /> : null}
            </View>
            <Typography variant="caption">{opt.estimatedFee}</Typography>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
