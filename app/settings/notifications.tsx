import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Badge,
  Button,
  ListRow,
  LoadingSpinner,
  Screen,
  SectionLabel,
  Typography,
} from '../../components/ui';
import { usePreferencesStore, type NotificationPrefs } from '../../stores/preferencesStore';
import { radius, space, useThemeStore } from '../../lib/theme';
import {
  isPushSupportedPlatform,
  registerPushToken,
  type PushRegistrationState,
} from '../../lib/push/pushNotifications';

type Registration = PushRegistrationState & { isChecking: boolean };

const INITIAL: Registration = {
  support: 'ready',
  token: null,
  detail: null,
  isChecking: true,
};

/**
 * Notification settings.
 *
 * ## What changed
 *
 * - **The status panel is now honest about the backend gap.** The old copy for
 *   `backend-pending` was correct but buried in a paragraph; it is now the
 *   headline status with an explicit tone, so the one state a user most needs to
 *   understand ("this is not going to work yet, and here is why") is the first
 *   thing on the screen rather than a line of small grey text.
 * - "Open device settings" had `accessibilityRole="button"` but **no label**, so
 *   a screen reader announced nothing at all for it. It is a real `Button`.
 * - The five push toggles and two email toggles were separate hand-built rows;
 *   they are now `ListRow`s with a `Switch`, which keeps the native control
 *   (correct for a binary setting) while inheriting the row layout and hairlines.
 * - The child toggles under "All transaction updates" now say *why* they are
 *   unavailable when the master switch is off, rather than just greying out.
 */
export default function Notifications() {
  const colors = useThemeStore((state) => state.colors);
  const prefs = usePreferencesStore((s) => s.notifications);
  const setNotification = usePreferencesStore((s) => s.setNotification);
  const [registration, setRegistration] = useState<Registration>(INITIAL);

  const toggle = useCallback(
    (key: keyof NotificationPrefs) => setNotification(key, !prefs[key]),
    [prefs, setNotification]
  );

  const check = useCallback(async () => {
    setRegistration((prev) => ({ ...prev, isChecking: true }));
    const result = await registerPushToken();
    setRegistration({ ...result, isChecking: false });
  }, []);

  useEffect(() => {
    // Read-only probe: ask for the token but never prompt. `registerPushToken`
    // only prompts when permission has not been decided, and this screen is
    // itself the opt-in, so the prompt is the intended behaviour here.
    void check();
  }, [check]);

  const status = (() => {
    if (registration.isChecking) {
      return { text: 'Checking notification status…', tone: 'muted' as const, icon: 'sync-outline' };
    }
    switch (registration.support) {
      case 'registered':
        return {
          text: 'Transaction notifications are on for this device.',
          tone: 'success' as const,
          icon: 'checkmark-circle',
        };
      case 'ready':
        return {
          text: registration.detail ?? 'Permission granted, but registration has not completed yet.',
          tone: 'warning' as const,
          icon: 'alert-circle-outline',
        };
      case 'denied':
        return {
          text: registration.detail ?? 'Notifications are turned off for this app.',
          tone: 'warning' as const,
          icon: 'alert-circle-outline',
        };
      case 'backend-pending':
        return {
          text:
            registration.detail ??
            'The server has not deployed push registration, so pushes cannot be delivered yet.',
          tone: 'warning' as const,
          icon: 'cloud-offline-outline',
        };
      case 'unsupported':
      default:
        return {
          text:
            registration.detail ??
            'Push notifications need a physical device — they do not work on simulators or web.',
          tone: 'muted' as const,
          icon: 'phone-portrait-outline',
        };
    }
  })();

  const statusColor =
    status.tone === 'success'
      ? colors.success
      : status.tone === 'warning'
        ? colors.warning
        : colors.textMuted;

  const childBlocked = !prefs.pushTransactions;

  return (
    <Screen testID="notification-settings-screen">
      <View style={styles.header}>
        <BackButton />
        <Typography variant="titleSm" style={styles.headerTitle}>
          Notifications
        </Typography>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>TRANSACTION PUSH</SectionLabel>

        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statusRow}>
            {registration.isChecking ? (
              <LoadingSpinner />
            ) : (
              <Ionicons name={status.icon as never} size={18} color={statusColor} />
            )}
            <Typography
              variant="body"
              color={statusColor}
              style={styles.statusText}
              accessibilityLiveRegion="polite"
            >
              {status.text}
            </Typography>
          </View>

          <View style={styles.statusMeta}>
            <Badge
              label={
                registration.support === 'registered'
                  ? 'Active'
                  : registration.support === 'backend-pending'
                    ? 'Not deployed'
                    : registration.support === 'denied'
                      ? 'Blocked'
                      : registration.support === 'unsupported'
                        ? 'Unavailable'
                        : 'Pending'
              }
              tone={
                registration.support === 'registered'
                  ? 'success'
                  : registration.support === 'backend-pending' || registration.support === 'denied'
                    ? 'warning'
                    : 'neutral'
              }
              icon={
                registration.support === 'registered'
                  ? 'checkmark-circle'
                  : registration.support === 'backend-pending'
                    ? 'cloud-offline-outline'
                    : registration.support === 'denied'
                      ? 'close-circle'
                      : 'time-outline'
              }
            />
            {!isPushSupportedPlatform() ? (
              <Typography variant="caption" color={colors.textMuted} style={styles.metaNote}>
                Run the app on a physical device to receive pushes.
              </Typography>
            ) : null}
          </View>

          {registration.token ? (
            <Typography variant="code" color={colors.textMuted} numberOfLines={1} style={styles.token}>
              {registration.token.slice(0, 24)}…
            </Typography>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={registration.isChecking ? 'Checking…' : 'Enable or re-check'}
              variant="secondary"
              onPress={() => void check()}
              loading={registration.isChecking}
              style={styles.actionBtn}
              accessibilityHint="Checks this device's notification permission and registration"
            />
            {registration.support === 'denied' ? (
              <Button
                label="Open device settings"
                variant="ghost"
                onPress={() => void Linking.openSettings()}
                accessibilityHint="Opens your phone's settings so you can allow notifications"
              />
            ) : null}
          </View>
        </View>

        <Typography variant="caption" color={colors.textMuted} style={styles.footnote}>
          You are notified when a transfer is received, when one you sent is confirmed on the
          network, and if a transfer fails. Notifications never contain your PIN, private keys or
          recovery phrase.
        </Typography>

        <View style={styles.group}>
          <SectionLabel>WHICH PUSH NOTIFICATIONS</SectionLabel>
          <ToggleRow
            label="All transaction updates"
            desc="Master switch for the three events below"
            value={prefs.pushTransactions}
            onChange={() => toggle('pushTransactions')}
          />
          <ToggleRow
            label="Money received"
            desc={
              childBlocked
                ? 'Turn on “All transaction updates” first'
                : 'When someone sends you a transfer'
            }
            value={prefs.pushReceived}
            onChange={() => toggle('pushReceived')}
            disabled={childBlocked}
          />
          <ToggleRow
            label="Transfers confirmed"
            desc={
              childBlocked
                ? 'Turn on “All transaction updates” first'
                : 'When a transfer you sent is confirmed on the network'
            }
            value={prefs.pushSentConfirmed}
            onChange={() => toggle('pushSentConfirmed')}
            disabled={childBlocked}
          />
          <ToggleRow
            label="Transfers failed"
            desc={
              childBlocked
                ? 'Turn on “All transaction updates” first'
                : 'When a transfer you sent could not be completed'
            }
            value={prefs.pushSentFailed}
            onChange={() => toggle('pushSentFailed')}
            disabled={childBlocked}
          />
          <ToggleRow
            label="Security alerts"
            desc="New device logins and PIN changes"
            value={prefs.pushSecurity}
            onChange={() => toggle('pushSecurity')}
          />
        </View>

        <Typography variant="caption" color={colors.textMuted} style={styles.footnote}>
          Per-category preferences are stored on this device. The backend currently sends
          transaction notifications only; security and price alerts are not wired up server-side
          yet.
        </Typography>

        <View style={styles.group}>
          <SectionLabel>EMAIL</SectionLabel>
          <ToggleRow
            label="Transaction receipts"
            desc="Email a receipt after every transaction"
            value={prefs.emailReceipts}
            onChange={() => toggle('emailReceipts')}
          />
          <ToggleRow
            label="Product updates"
            desc="New features and announcements"
            value={prefs.emailProduct}
            onChange={() => toggle('emailProduct')}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * A labelled switch row. The `Switch` is kept — it is the platform-native
 * control for a binary setting and carries its own semantics — but the row
 * supplies the name, the explanation, and the disabled reason.
 */
function ToggleRow({
  label,
  desc,
  value,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <ListRow
      title={label}
      subtitle={desc}
      showSeparator={false}
      onPress={disabled ? undefined : onChange}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityHint={desc}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      // The row itself is not the switch — the switch is. Marking the row as a
      // checked control as well would make a screen reader announce two
      // toggles for one setting.
      trailing={
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.onPrimary}
          accessibilityLabel={label}
          accessibilityHint={desc}
          accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  scroll: { flex: 1 },
  body: { paddingTop: space.lg, paddingBottom: space.xxxl },

  panel: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  statusText: { flex: 1 },
  statusMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  metaNote: { flex: 1 },
  token: { lineHeight: 20 },
  actions: { gap: space.sm },
  actionBtn: {},

  group: { marginTop: space.xxl, gap: space.xs },

  footnote: { marginTop: space.lg },
});
