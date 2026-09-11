import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Switch, ScrollView, Alert,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';

import { useUserStore } from '../../stores/userStore';
import { changePin, listSessions, revokeSession, type SessionInfo } from '../../lib/api/auth';
import type { ApiErrorShape } from '../../lib/api/client';
import { useThemeStore, ThemeColors } from '../../lib/theme';

function formatSessionLabel(s: SessionInfo): string {
  const ua = s.userAgent ?? '';
  if (/iphone|ios/i.test(ua)) return 'iPhone';
  if (/android/i.test(ua)) return 'Android device';
  if (/chrome/i.test(ua)) return 'Chrome browser';
  if (/safari/i.test(ua)) return 'Safari browser';
  return 'Unknown device';
}

export default function Security() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const biometricEnabled = useUserStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useUserStore((s) => s.setBiometricEnabled);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [changingPin, setChangingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleBiometricToggle = async (value: boolean) => {
    if (!value) {
      await setBiometricEnabled(false);
      return;
    }
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      Alert.alert(
        'Not available',
        'No Face ID / Fingerprint is set up on this device yet. Set one up in your device settings first.'
      );
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to enable biometric unlock',
    });
    if (result.success) {
      await setBiometricEnabled(true);
    }
  };

  const handleRevoke = (id: string) => {
    Alert.alert('Revoke session', 'End this session on the selected device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeSession(id);
            setSessions((prev) => prev.filter((s) => s.id !== id));
          } catch (err) {
            Alert.alert('Error', (err as ApiErrorShape).message ?? 'Could not revoke session');
          }
        },
      },
    ]);
  };

  const handleSavePin = async () => {
    setPinError(null);
    if (currentPin.length !== 6) return setPinError('Enter your current 6-digit PIN');
    if (newPin.length !== 6) return setPinError('Enter a new 6-digit PIN');
    if (newPin === currentPin) return setPinError('New PIN must be different from current PIN');

    setSavingPin(true);
    try {
      await changePin(currentPin, newPin);
      setChangingPin(false);
      setCurrentPin('');
      setNewPin('');
      Alert.alert('PIN updated', 'Your PIN has been changed successfully.');
    } catch (err) {
      setPinError((err as ApiErrorShape).message ?? 'Could not change PIN');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Security</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body}>
          {!changingPin ? (
            <Pressable style={styles.actionRow} onPress={() => setChangingPin(true)}>
              <Text style={styles.actionLabel}>Change PIN</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : (
            <View style={styles.card}>
              <View style={styles.pinFieldWrap}>
                <Text style={styles.pinLabel}>Current PIN</Text>
                <TextInput
                  style={styles.pinInput}
                  value={currentPin}
                  onChangeText={(v) => setCurrentPin(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  placeholder="••••••"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.pinFieldWrap}>
                <Text style={styles.pinLabel}>New PIN</Text>
                <TextInput
                  style={styles.pinInput}
                  value={newPin}
                  onChangeText={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  placeholder="••••••"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              {pinError && <Text style={styles.error}>{pinError}</Text>}
              <View style={styles.pinActionsRow}>
                <Pressable
                  style={styles.pinCancelBtn}
                  onPress={() => { setChangingPin(false); setCurrentPin(''); setNewPin(''); setPinError(null); }}
                >
                  <Text style={styles.pinCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.pinSaveBtn} onPress={handleSavePin} disabled={savingPin}>
                  {savingPin ? <ActivityIndicator color="#fff" /> : <Text style={styles.pinSaveText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Biometric Unlock</Text>
                <Text style={styles.toggleDesc}>Use Face ID / Fingerprint to open the app</Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={[styles.toggleRow, styles.toggleRowLast]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Two-Factor Authentication</Text>
                <Text style={styles.toggleDesc}>Coming soon — not yet available</Text>
              </View>
              <Switch value={false} disabled trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.textMuted} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Active Sessions</Text>
          <View style={styles.card}>
            {loadingSessions ? (
              <View style={styles.sessionRow}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : sessions.length === 0 ? (
              <View style={styles.sessionRow}>
                <Text style={styles.toggleDesc}>No active sessions found</Text>
              </View>
            ) : (
              sessions.map((s, idx) => (
                <View key={s.id} style={[styles.sessionRow, idx === sessions.length - 1 && styles.toggleRowLast]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>
                      {formatSessionLabel(s)} {s.current ? '(This device)' : ''}
                    </Text>
                    <Text style={styles.toggleDesc}>{s.ipAddress ?? 'Unknown location'}</Text>
                  </View>
                  {!s.current && (
                    <Pressable onPress={() => handleRevoke(s.id)}>
                      <Text style={styles.revokeText}>Revoke</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  back: { color: colors.textPrimary, fontSize: 28 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  actionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 16, marginBottom: 16,
  },
  actionLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 20 },
  card: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: 24, padding: 16,
  },
  pinFieldWrap: { marginBottom: 14 },
  pinLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 6, fontWeight: '500' },
  pinInput: {
    backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.textPrimary, fontSize: 18, letterSpacing: 4, borderWidth: 1, borderColor: colors.border,
  },
  pinActionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  pinCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  pinCancelText: { color: colors.textMuted, fontWeight: '600' },
  pinSaveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.primary,
  },
  pinSaveText: { color: '#FFFFFF', fontWeight: '600' },
  error: { color: colors.error, fontSize: 13, marginBottom: 8 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceElevated,
  },
  toggleRowLast: { borderBottomWidth: 0 },
  toggleLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  toggleDesc: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginBottom: 10 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceElevated,
  },
  revokeText: { color: colors.error, fontSize: 13, fontWeight: '600' },
});
}
