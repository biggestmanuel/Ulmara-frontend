import { Tabs } from 'expo-router';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../../lib/theme';

export default function TabsLayout() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const tabs = [
    { name: 'home', label: 'Home', icon: 'home-outline' as const },
    { name: 'activity', label: 'Transactions', icon: 'time-outline' as const },
    { name: 'balances', label: 'Balances', icon: 'wallet-outline' as const },
    { name: 'profile', label: 'Profile', icon: 'person-outline' as const },
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={({ state, descriptors, navigation }) => (
        <View style={[styles.dockWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={[styles.dock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {tabs.map((tab) => {
              const route = state.routes.find((item) => item.name === tab.name);
              if (!route) return null;
              const focused = state.routes[state.index]?.name === route.name;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  onPress={() => navigation.navigate(route.name)}
                  style={styles.dockItem}
                >
                  <View style={[styles.iconBubble, focused && { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name={tab.icon} size={20} color={focused ? colors.primary : colors.textMuted} />
                  </View>
                  <Text style={[styles.dockLabel, { color: focused ? colors.primary : colors.textMuted }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              onPress={() => router.push('/send')}
              style={[styles.sendButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            >
              <Ionicons name="arrow-up" size={25} color="#FFFFFF" />
              <Text style={styles.sendLabel}>Send</Text>
            </Pressable>
          </View>
        </View>
      )}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="balances"
        options={{
          title: 'Balances',
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Transactions',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dockWrap: { paddingHorizontal: 16, backgroundColor: 'transparent' },
  dock: {
    minHeight: 76,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  dockItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconBubble: { width: 38, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dockLabel: { fontSize: 10, fontWeight: '700' },
  sendButton: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
    marginHorizontal: 4,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 12,
  },
  sendLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', marginTop: 1 },
});