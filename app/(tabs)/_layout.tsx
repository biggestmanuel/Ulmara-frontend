import { View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBar, type TabItem } from '../../components/navigation/TabBar';
import { gutter, useThemeStore } from '../../lib/theme';

/**
 * Tab navigation.
 *
 * ## What changed
 *
 * The route set, order and destinations are unchanged — five items with Send in
 * the middle — so no navigation is lost. What changed is the *chrome*: the
 * previous layout built a floating 26pt-radius pill with a 64pt Send button
 * raised out of it (`marginTop: -28`, `elevation: 12`) inline in this file.
 * That is now `components/navigation/TabBar`, a flat bar with a single hairline,
 * and this file only decides which screens exist and where Send sits.
 *
 * Keeping the bar as a real component (rather than an inline `tabBar` render
 * prop) also means the five tab buttons are stable components with stable
 * `accessibilityState`, instead of being rebuilt inside a render callback on
 * every navigation.
 */
export default function TabsLayout() {
  const colors = useThemeStore((state) => state.colors);
  const insets = useSafeAreaInsets();

  const tabs: TabItem[] = [
    { key: 'home', label: 'Home', icon: 'home-outline' },
    { key: 'activity', label: 'Activity', icon: 'time-outline' },
    { key: 'send', label: 'Send', icon: 'arrow-up-outline' },
    { key: 'balances', label: 'Balances', icon: 'wallet-outline' },
    { key: 'profile', label: 'Profile', icon: 'person-outline' },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View
          style={{
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingHorizontal: gutter,
          }}
        >
          <TabBar
            tabs={tabs}
            activeKey={state.routes[state.index]?.name ?? 'home'}
            primaryKey="send"
            onPrimaryPress={() => router.push('/send')}
            onChange={(key) => {
              if (key === 'send') {
                router.push('/send');
                return;
              }
              const route = state.routes.find((item) => item.name === key);
              if (route) navigation.navigate(route.name);
            }}
          />
        </View>
      )}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="balances" options={{ title: 'Balances' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
