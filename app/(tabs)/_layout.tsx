import { Tabs } from 'expo-router';
import { Text, View, StyleSheet, type ColorValue } from 'react-native';
import { useThemeStore } from '../../lib/theme';

function TabIcon({ symbol, focused, color }: { symbol: string; focused: boolean; color: ColorValue }) {
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.symbol, { color, opacity: focused ? 1 : 0.5 }]}>{symbol}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useThemeStore();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 72,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => <TabIcon symbol="⌂" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="balances"
        options={{
          title: 'Balances',
          tabBarIcon: ({ focused, color }) => <TabIcon symbol="⛁" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => <TabIcon symbol="◯" focused={focused} color={color} />,
        }}
      />
      {/* Hide any unused legacy tab screens if present */}
      <Tabs.Screen name="activity" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: { alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 20, fontWeight: '700' },
});