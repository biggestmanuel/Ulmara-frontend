import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  AccountId,
  Avatar,
  Button,
  ListRow,
  Sheet,
  Typography,
} from '../../components/ui';
import { useUserStore } from '../../stores/userStore';
import { deleteAccount as deleteAccountApi } from '../../lib/api/auth';
import { useCopyToast } from '../../components/ui/CopyToast';
import { friendlyError } from '../../lib/api/client';
import { radius, space, useThemeStore } from '../../lib/theme';

const MENU = [
  { label: 'Settings', detail: 'Theme, security, notifications', icon: 'settings-outline' as const, route: '/settings' },
  { label: 'Notification settings', detail: 'What Ulmara tells you about', icon: 'notifications-outline' as const, route: '/settings/notifications' },
];

/**
 * Profile.
 *
 * ## What changed
 *
 * - The account header was a **56pt accent-filled circle with a 28pt initial**
 *   plus a separate "big avatar" on the profile, with the name in two different
 *   treatments. There is now one `Avatar` and one `AccountId` block, both
 *   theme-driven, and the ID uses the same component as Home so the two screens
 *   present the user's identity identically.
 * - The three "menu rows" (settings, log out, delete) were three separately
 *   styled `Pressable`s. They are now `ListRow`s and `Button`s, which is what
 *   gives each of them an accessible name and a real 44pt target — the previous
 *   "Delete Account" control in particular was a bare text link with no role and
 *   no label.
 * - The two hand-rolled modals became `Sheet`s, so they get a focus-trapping
 *   container, a named close control, and a labelled backdrop.
 * - "Delete account" is now genuinely secondary: it is a quiet text button in the
 *   error colour, not an outlined destructive button competing with Log out.
 */
export default function Profile() {
  const colors = useThemeStore((state) => state.colors);
  const profile = useUserStore((s) => s.profile);
  const accountId = useUserStore((s) => s.accountId);
  const logout = useUserStore((s) => s.logout);

  const [showLogout, setShowLogout] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { copyToClipboard } = useCopyToast();

  const displayName = profile?.name?.trim() || 'Ulmara user';
  const email = profile?.email || 'No email on file';

  const handleLogout = async () => {
    setBusy(true);
    try {
      setShowLogout(false);
      await logout();
      router.replace('/(auth)/welcome');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      // Delete remotely first; if that fails the user is still signed in and we
      // say so. Only once the server has accepted do we tear down local state —
      // clearing SecureStore first would leave an orphaned account with no way
      // back into it.
      await deleteAccountApi();
      await logout();
      setShowDelete(false);
      router.replace('/(auth)/welcome');
    } catch (err) {
      setError(friendlyError(err, 'Could not delete your account. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Typography variant="title">{displayName}</Typography>
              <Typography variant="body" color={colors.textMuted} style={styles.email}>
                {email}
              </Typography>
            </View>
            <Avatar name={displayName} size={56} />
          </View>

          <View style={styles.idBlock}>
            <AccountId
              value={accountId ?? ''}
              onCopy={() => copyToClipboard(accountId ?? '', 'Account ID copied')}
            />
          </View>

          <View style={styles.menu}>
            {MENU.map((item, index) => (
              <ListRow
                key={item.route}
                title={item.label}
                subtitle={item.detail}
                leading={
                  <View style={[styles.menuIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name={item.icon} size={17} color={colors.primary} />
                  </View>
                }
                showSeparator={index < MENU.length - 1}
                onPress={() => router.push(item.route as never)}
                accessibilityLabel={item.label}
                accessibilityHint={item.detail}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Button
              label="Log out"
              variant="secondary"
              onPress={() => setShowLogout(true)}
              loading={busy && showLogout}
            />
            <Button
              label="Delete account"
              variant="ghost"
              onPress={() => {
                setError(null);
                setShowDelete(true);
              }}
              style={styles.delete}
            />
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={showLogout}
        onClose={() => setShowLogout(false)}
        title="Log out?"
        subtitle="You will need your password and PIN to get back in."
        footer={<Button label="Log out" variant="destructive" onPress={handleLogout} loading={busy} />}
      >
        <Typography variant="body" color={colors.textSecondary}>
          Your wallet stays on this device. Only the session on this device ends.
        </Typography>
      </Sheet>

      <Sheet
        visible={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete your account?"
        subtitle="This cannot be undone."
        footer={
          <>
            <Button
              label="Delete permanently"
              variant="destructive"
              onPress={handleDelete}
              loading={busy}
            />
            <Button label="Keep my account" variant="ghost" onPress={() => setShowDelete(false)} />
          </>
        }
      >
        <Typography variant="body" color={colors.textSecondary}>
          Your account, registered wallets and transaction history are removed. Funds already
          sent to people on your account are not affected.
        </Typography>
        {error ? (
          <Typography
            variant="label"
            color={colors.error}
            style={styles.sheetError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {error}
          </Typography>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl },
  column: { paddingHorizontal: 24, paddingTop: space.xl },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headerText: { flex: 1, minWidth: 0 },
  email: { marginTop: space.xs },

  idBlock: { marginTop: space.xl, paddingTop: space.xl },

  menu: { marginTop: space.xl, marginHorizontal: -24, paddingHorizontal: 24 },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actions: { marginTop: space.xxl, gap: space.sm },
  delete: { backgroundColor: 'transparent' },

  sheetError: { marginTop: space.lg },
});
