import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Button,
  EmptyState,
  Input,
  ListRow,
  LoadingSpinner,
  Screen,
  SectionLabel,
  Sheet,
  Typography,
} from '../../components/ui';
import { useUserStore } from '../../stores/userStore';
import { changePin, listSessions, revokeSession, type SessionInfo } from '../../lib/api/auth';
import { friendlyError, toApiError } from '../../lib/api/client';
import { space, useThemeStore } from '../../lib/theme';
import {
  authenticateWithBiometrics,
  describeOutcome,
  getBiometricCapability,
  setBiometricEnabled as persistBiometricPreference,
  type BiometricCapability,
} from '../../lib/security/biometrics';

function formatSessionLabel(s: SessionInfo): string {
  const ua = s.userAgent ?? '';
  if (/iphone|ios/i.test(ua)) return 'iPhone';
  if (/android/i.test(ua)) return 'Android device';
  if (/chrome/i.test(ua)) return 'Chrome browser';
  if (/safari/i.test(ua)) return 'Safari browser';
  return 'Unknown device';
}

/**
 * Security.
 *
 * ## What changed
 *
 * - The `Alert.alert('PIN updated', ...)` on a successful PIN change became an
 *   in-place confirmation. `Alert` is a system dialog that ignores the theme
 *   entirely on Android and renders as a bare browser dialog on web, so the one
 *   moment the user most wants to read clearly was the one moment the app looked
 *   least like itself.
 * - The revoke confirmation is the same, for the same reason.
 * - Section headings use the shared `SectionLabel`, the PIN fields use `Input`
 *   (so each carries its own error and a 2pt focus ring), and the session list
 *   uses `ListRow`.
 * - The biometric row keeps its `Switch`, which is correct here — a switch is the
 *   platform-native control for a binary setting, and it carries its own
 *   accessibility semantics. It is given an explicit `accessibilityLabel` and a
 *   hint explaining that it does not replace the PIN.
 *
 * The security *model* is unchanged: biometrics are a device-local unlock
 * shortcut, the PIN is the only credential the server accepts, and nothing
 * biometric is stored or transmitted.
 */
export default function Security() {
  const colors = useThemeStore((state) => state.colors);
  const biometricEnabled = useUserStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useUserStore((s) => s.setBiometricEnabled);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [changingPin, setChangingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [pinDone, setPinDone] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricNotice, setBiometricNotice] = useState<string | null>(null);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (err) {
      setSessionsError(friendlyError(err, 'Could not load your active sessions.'));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    void getBiometricCapability().then(setCapability).catch(() => undefined);
  }, [loadSessions]);

  /**
   * Enabling requires a successful biometric check on the spot. That proves the
   * enrolment actually works on this device before the preference is stored,
   * so the user is never left with a switch that is on but cannot succeed.
   */
  const handleBiometricToggle = useCallback(
    async (next: boolean) => {
      if (!next) {
        await persistBiometricPreference(false);
        await setBiometricEnabled(false);
        setBiometricNotice(null);
        return;
      }
      setBiometricBusy(true);
      setBiometricNotice(null);
      try {
        const outcome = await authenticateWithBiometrics({
          promptTitle: 'Enable biometric unlock',
          promptSubtitle: 'Confirm it is you to turn this on',
          fallbackLabel: 'Not now',
        });
        if (outcome === 'success') {
          await persistBiometricPreference(true);
          await setBiometricEnabled(true);
        } else {
          setBiometricNotice(
            describeOutcome(outcome) ?? 'Biometric unlock was not set up, so nothing changed.'
          );
        }
      } finally {
        setBiometricBusy(false);
      }
    },
    [setBiometricEnabled]
  );

  const handleSavePin = useCallback(async () => {
    setPinError(null);
    setPinDone(false);
    if (currentPin.length !== 6) return setPinError('Enter your current 6-digit PIN');
    if (newPin.length !== 6) return setPinError('Enter a new 6-digit PIN');
    if (newPin === currentPin) return setPinError('Choose a PIN different from your current one');

    setSavingPin(true);
    try {
      await changePin(currentPin, newPin);
      setChangingPin(false);
      setCurrentPin('');
      setNewPin('');
      setPinDone(true);
    } catch (err) {
      // A 423 here is the shared lockout firing on the current-PIN check —
      // that is the backend protecting the same hash transfers use, not a bug.
      setPinError(friendlyError(toApiError(err), 'Could not change your PIN.'));
    } finally {
      setSavingPin(false);
    }
  }, [currentPin, newPin]);

  const closePinForm = useCallback(() => {
    setChangingPin(false);
    setCurrentPin('');
    setNewPin('');
    setPinError(null);
  }, []);

  const confirmRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    const id = revokeTarget.id;
    setRevoking(true);
    try {
      await revokeSession(id);
      setSessions((prev) => prev.filter((entry) => entry.id !== id));
      setRevokeTarget(null);
    } catch (err) {
      setSessionsError(friendlyError(err, 'Could not sign that session out.'));
      setRevokeTarget(null);
    } finally {
      setRevoking(false);
    }
  }, [revokeTarget]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="security-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Security
          </Typography>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* --- PIN ------------------------------------------------------- */}
          <SectionLabel>TRANSACTION PIN</SectionLabel>
          {!changingPin ? (
            <ListRow
              title="Change your PIN"
              subtitle="Your PIN authorises every transfer and unlocks the app"
              onPress={() => {
                setPinDone(false);
                setChangingPin(true);
              }}
              accessibilityLabel="Change your PIN"
              accessibilityHint="Opens a form to set a new six-digit PIN"
              showSeparator={false}
            />
          ) : (
            <View style={styles.form}>
              <Input
                label="Current PIN"
                placeholder="••••••"
                value={currentPin}
                onChangeText={(v) => setCurrentPin(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
              />
              <Input
                label="New PIN"
                placeholder="••••••"
                value={newPin}
                onChangeText={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
              />

              {pinError ? (
                <Typography
                  variant="label"
                  color={colors.error}
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                >
                  {pinError}
                </Typography>
              ) : null}

              <Button label="Save new PIN" onPress={handleSavePin} loading={savingPin} />
              <Button label="Cancel" variant="ghost" onPress={closePinForm} disabled={savingPin} />
            </View>
          )}

          {pinDone ? (
            <View style={styles.done} accessibilityLiveRegion="polite" accessibilityRole="alert">
              <Ionicons name="checkmark-circle" size={17} color={colors.success} />
              <Typography variant="label" color={colors.success}>
                Your PIN has been changed.
              </Typography>
            </View>
          ) : null}

          {/* --- biometrics ------------------------------------------------ */}
          <View style={styles.group}>
            <SectionLabel>APP UNLOCK</SectionLabel>
            <ListRow
              title={capability ? `${capability.label} unlock` : 'Biometric unlock'}
              subtitle={
                biometricEnabled
                  ? `Open the app with ${capability?.label ?? 'biometrics'} instead of typing your PIN`
                  : 'Open the app with Face ID or fingerprint instead of typing your PIN'
              }
              showSeparator={false}
              accessibilityLabel={capability ? `${capability.label} unlock` : 'Biometric unlock'}
              accessibilityHint="Unlocks the app on this device. It does not replace your PIN for transfers."
              trailing={
                biometricBusy ? (
                  <LoadingSpinner />
                ) : (
                  <Switch
                    value={biometricEnabled}
                    onValueChange={(next) => void handleBiometricToggle(next)}
                    trackColor={{ false: colors.borderControl, true: colors.primary }}
                    thumbColor={colors.onPrimary}
                    accessibilityLabel="Biometric unlock"
                    accessibilityState={{ checked: biometricEnabled, busy: biometricBusy }}
                  />
                )
              }
            />

            {biometricNotice ? (
              <Typography
                variant="caption"
                color={colors.warning}
                style={styles.notice}
                accessibilityLiveRegion="polite"
              >
                {biometricNotice}
              </Typography>
            ) : null}

            <View style={styles.explainer}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
              <Typography variant="caption" color={colors.textMuted} style={styles.explainerText}>
                Biometrics only unlock this device's app. They never replace your PIN for
                transfers, and no biometric data is ever stored or sent.
              </Typography>
            </View>
          </View>

          {/* --- sessions -------------------------------------------------- */}
          <View style={styles.group}>
            <SectionLabel>ACTIVE SESSIONS</SectionLabel>

            {loadingSessions ? (
              <LoadingSpinner size="large" label="Loading your sessions" />
            ) : sessionsError ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Sessions unavailable"
                body={sessionsError}
                actionLabel="Try again"
                onAction={() => void loadSessions()}
              />
            ) : sessions.length === 0 ? (
              <Typography variant="body" color={colors.textMuted} style={styles.noSessions}>
                No other active sessions.
              </Typography>
            ) : (
              sessions.map((s, index) => (
                <ListRow
                  key={s.id}
                  title={`${formatSessionLabel(s)}${s.current ? ' · this device' : ''}`}
                  subtitle={s.ipAddress ?? 'Unknown location'}
                  showSeparator={index < sessions.length - 1}
                  actions={
                    s.current
                      ? []
                      : [
                          {
                            icon: 'log-out-outline',
                            label: `Sign out ${formatSessionLabel(s)}`,
                            onPress: () => setRevokeTarget(s),
                          },
                        ]
                  }
                />
              ))
            )}
          </View>
        </ScrollView>
      </Screen>

      <Sheet
        visible={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="Sign out this session?"
        subtitle={revokeTarget ? formatSessionLabel(revokeTarget) : undefined}
        footer={
          <>
            <Button
              label="Sign it out"
              variant="destructive"
              loading={revoking}
              onPress={confirmRevoke}
            />
            <Button label="Keep it" variant="ghost" onPress={() => setRevokeTarget(null)} />
          </>
        }
      >
        <Typography variant="body" color={colors.textSecondary}>
          That device will be signed out and will need your password and PIN to get back in.
        </Typography>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  scroll: { flex: 1 },
  body: { paddingTop: space.lg, paddingBottom: space.xxxl },

  form: { gap: space.md },
  done: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  group: { marginTop: space.xxl },
  notice: { marginTop: space.md },
  explainer: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.lg },
  explainerText: { flex: 1 },
  noSessions: { textAlign: 'center', paddingVertical: space.md },
});
