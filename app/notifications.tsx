import { memo, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';

import { BackButton } from '../components/navigation/BackButton';
import {
  EmptyState,
  ListRow,
  Screen,
  Touchable,
  Typography,
} from '../components/ui';
import { useNotificationStore, type NotificationItem } from '../stores/notificationStore';
import { useUserStore } from '../stores/userStore';
import { formatAccountId } from '../lib/format';
import { gutter, radius, space, useThemeStore } from '../lib/theme';

/**
 * In-app notification centre.
 *
 * Previously a hardcoded empty state. It now lists the transaction pushes that
 * actually arrived on this device, which is what makes foreground handling,
 * deduplication and tap-to-navigate observable.
 *
 * ## What changed
 *
 * - Rows were individually bordered cards with a **left border coloured by
 *   status**, so a screen full of notifications read as ten unrelated boxes.
 *   The status now lives in a tinted icon and a labelled unread marker, and the
 *   rows are a list.
 * - **Unread state was a coloured dot with no accessible name.** A screen reader
 *   heard the same label for a read and an unread notification. `accessibilityState`
 *   now carries it, and the row's label says how many are unread.
 * - The per-row time is formatted rather than `toLocaleString()` of a raw
 *   `Date`, and it is marked `numeric` so the digits line up.
 * - "Mark all read" was a bare text pressable with no role and no label; it is
 *   a named control that reports how many it will affect.
 */
export default function NotificationsScreen() {
  const colors = useThemeStore((state) => state.colors);
  const items = useNotificationStore((s) => s.items);
  const isHydrated = useNotificationStore((s) => s.isHydrated);
  const hydrate = useNotificationStore((s) => s.hydrate);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const accountId = useUserStore((s) => s.accountId);

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [isHydrated, hydrate]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const openItem = useCallback(
    (item: NotificationItem) => {
      markRead(item.id);
      router.push(item.route as never);
    },
    [markRead]
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => <NotificationRow item={item} onPress={openItem} />,
    [openItem]
  );

  const keyExtractor = useCallback((item: NotificationItem) => item.id, []);

  return (
    <Screen scroll={false} contentStyle={styles.screen} testID="notifications-screen">
      <View style={styles.header}>
        <BackButton />
        <Typography variant="titleSm" style={styles.headerTitle}>
          Notifications
        </Typography>
        {unreadCount > 0 ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`Mark all ${unreadCount} notifications as read`}
            onPress={markAllRead}
            pressScale={0.97}
            style={styles.markAll}
          >
            <Typography variant="label" color={colors.primary}>
              Mark all read
            </Typography>
          </Touchable>
        ) : null}
      </View>

      {unreadCount > 0 ? (
        <View style={[styles.count, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="notifications" size={14} color={colors.primary} />
          <Typography variant="caption" color={colors.primary}>
            {unreadCount} unread
          </Typography>
        </View>
      ) : null}

      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        drawDistance={250}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-off-outline"
            title="Nothing yet"
            body="Notifications appear here the moment a transfer is received, confirmed, or fails. They are delivered to this device only."
          />
        }
      />

      {accountId ? (
        <Typography variant="caption" color={colors.textMuted} style={styles.footer}>
          Delivered to this device only, for Account ID {formatAccountId(accountId)}.
        </Typography>
      ) : null}
    </Screen>
  );
}

/**
 * Memoised: FlashList recycles aggressively, and an unmemoised row re-renders
 * every visible row each time any notification is marked read.
 */
const NotificationRow = memo(function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  const colors = useThemeStore((state) => state.colors);
  const tone =
    item.tone === 'success' ? colors.success : item.tone === 'error' ? colors.error : colors.textMuted;
  const icon =
    item.type === 'transfer.received'
      ? 'arrow-down-outline'
      : item.type === 'transfer.sent.confirmed'
        ? 'checkmark-circle-outline'
        : 'close-circle-outline';

  return (
    <ListRow
      title={item.title}
      subtitle={item.body}
      showSeparator={false}
      onPress={() => onPress(item)}
      // Unread is the one piece of state a user needs here, and it is invisible
      // to a screen reader unless it is named.
      accessibilityState={{ selected: !item.read }}
      accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}. ${formatWhen(item.receivedAt)}`}
      accessibilityHint="Opens the transaction"
      leading={
        <View style={[styles.iconBox, { backgroundColor: colors.surfaceElevated }]}>
          <Ionicons name={icon} size={18} color={tone} />
        </View>
      }
      trailing={
        <View style={styles.trailing}>
          <Typography variant="micro" color={colors.textMuted} numeric>
            {formatWhen(item.receivedAt)}
          </Typography>
          {item.read ? null : (
            <View
              accessible
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.unreadDot, { backgroundColor: colors.primary }]}
            />
          )}
        </View>
      }
    />
  );
});

/** "2 minutes ago" reads better than a full locale timestamp in a dense list. */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  screen: { paddingTop: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.md },
  headerTitle: { flex: 1 },
  markAll: { paddingVertical: space.sm, paddingHorizontal: space.sm },

  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    marginBottom: space.md,
  },

  list: {
    paddingTop: space.sm,
    paddingBottom: space.xl,
    marginHorizontal: -gutter,
    paddingHorizontal: gutter,
  },

  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: { alignItems: 'flex-end', gap: space.xs },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },

  footer: { textAlign: 'center', paddingTop: space.md },
});
