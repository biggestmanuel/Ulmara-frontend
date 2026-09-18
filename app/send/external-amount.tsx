import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '../../lib/theme';

export default function ExternalAmount() {
  const { colors } = useThemeStore();
  const params = useLocalSearchParams<{ externalAddress: string; asset: string; network: string; networkName: string; fee: string }>();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const next = () => {
    if (!parseFloat(amount) || parseFloat(amount) <= 0) return setError('Enter a valid amount');
    router.push({ pathname: '/send/confirm', params: { ...params, amount } });
  };
  return <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={[styles.back, { color: colors.textPrimary }]}>‹</Text></Pressable><Text style={[styles.title, { color: colors.textPrimary }]}>Amount</Text><View style={{ width: 24 }} /></View>
    <View style={styles.body}><Text style={[styles.caption, { color: colors.textMuted }]}>Sending {params.asset} on {params.networkName}</Text><TextInput autoFocus style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />{error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}</View>
    <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={next}><Text style={styles.buttonText}>Continue</Text></Pressable>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 }, back: { fontSize: 28 }, title: { fontSize: 18, fontWeight: '700' }, body: { flex: 1, padding: 20 }, caption: { marginBottom: 18 }, input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 18 }, error: { marginTop: 12 }, button: { margin: 20, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' } });
