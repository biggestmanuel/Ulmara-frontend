import { View, Pressable, StyleSheet } from 'react-native';
import { Typography } from '../ui';
import { useThemeStore } from '../../lib/theme';

interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function TabBar({ tabs, activeKey, onChange }: TabBarProps) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.row, { borderTopColor: colors.divider }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
            <Typography variant="label" color={active ? colors.primary : colors.textMuted}>{tab.label}</Typography>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
});
