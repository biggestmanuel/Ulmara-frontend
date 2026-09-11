import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { setPin as setPinApi } from '../../lib/api/auth';
import type { ApiErrorShape } from '../../lib/api/client';
import { useAuthGateStore } from '../../stores/authGateStore';
import { useThemeStore, ThemeColors } from '../../lib/theme';

const PIN_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function CreatePin() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [stage, setStage] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activePin = stage === 'create' ? pin : confirmPin;
  const setActivePin = stage === 'create' ? setPin : setConfirmPin;

  const persistPin = async (rawPin: string) => {
    setSaving(true);
    try {
      // Hashed and stored on the server (User.pinHash) — this is the PIN
      // you'll be asked for on every future login, on any device.
      await setPinApi(rawPin);
      // They just typed and confirmed it — that's proof enough for this
      // session, so mark it verified now rather than forcing an immediate
      // re-prompt at the end of onboarding (pinVerified otherwise only
      // flips via the verify-pin screen, which this flow never visits).
      useAuthGateStore.setState({ pinVerified: true });
      router.push('/(auth)/create-account-id');
    } catch (err) {
      console.error('Failed to persist PIN:', err);
      setError((err as ApiErrorShape).message ?? 'Something went wrong saving your PIN. Try again.');
      setConfirmPin('');
      setStage('create');
      setPin('');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyPress = (key: string) => {
    if (key === '' || saving) return;
    setError(null);

    if (key === 'del') {
      setActivePin(activePin.slice(0, -1));
      return;
    }

    if (activePin.length >= PIN_LENGTH) return;
    const next = activePin + key;
    setActivePin(next);

    if (next.length === PIN_LENGTH) {
      if (stage === 'create') {
        setTimeout(() => setStage('confirm'), 150);
      } else {
        if (next === pin) {
          persistPin(next);
        } else {
          setError('PINs do not match');
          setTimeout(() => {
            setConfirmPin('');
          }, 400);
        }
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title}>
          {stage === 'create' ? 'Create your PIN' : 'Confirm your PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {stage === 'create'
            ? 'Used to authorize transactions'
            : 'Enter your PIN again to confirm'}
        </Text>

        <View style={styles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i < activePin.length && styles.dotFilled]}
            />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.keypad}>
        {KEYS.map((key, idx) => (
          <Pressable
            key={idx}
            style={styles.key}
            onPress={() => handleKeyPress(key)}
            disabled={key === '' || saving}
          >
            <Text style={styles.keyText}>{key === 'del' ? '⌫' : key}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 56, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 8, marginBottom: 40, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.divider },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: { color: colors.error, fontSize: 13, marginTop: 24 },
  keypad: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, paddingBottom: 40,
  },
  key: {
    width: '33.33%', height: 76, alignItems: 'center', justifyContent: 'center',
  },
  keyText: { fontSize: 26, color: colors.textPrimary, fontWeight: '500' },
});
}
