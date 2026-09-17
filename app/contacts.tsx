import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../lib/theme';
import { createContact, deleteContact, listContacts, type Contact } from '../lib/api/contacts';

export default function Contacts() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setContacts(await listContacts()); }
    catch { setError('Contacts are unavailable right now.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const normalized = accountId.replace(/\D/g, '');
    if (normalized.length !== 10) return setError('Enter a valid 10-digit Account ID.');
    setSaving(true); setError(null);
    try {
      const contact = await createContact({ accountId: normalized, name: name.trim() || undefined });
      setContacts((items) => [contact, ...items]);
      setAccountId(''); setName('');
    } catch { setError('Could not save this contact.'); }
    finally { setSaving(false); }
  };

  const remove = (contact: Contact) => Alert.alert('Remove contact?', contact.name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await deleteContact(contact.id); setContacts((items) => items.filter((item) => item.id !== contact.id)); }
      catch { setError('Could not remove this contact.'); }
    } },
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Contacts</Text><View style={{ width: 24 }} /></View>
      <View style={styles.body}>
        <Text style={styles.label}>Add by Account ID</Text>
        <TextInput style={styles.input} value={accountId} onChangeText={(value) => setAccountId(value.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="0000 000 000" placeholderTextColor={colors.textMuted} />
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name (optional)" placeholderTextColor={colors.textMuted} />
        <Pressable style={styles.primary} onPress={add} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save contact</Text>}</Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.section}>Saved contacts</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : contacts.length === 0 ? <Text style={styles.muted}>No contacts yet.</Text> : contacts.map((contact) => (
          <View key={contact.id} style={styles.card}>
            <View style={{ flex: 1 }}><Text style={styles.name}>{contact.name}</Text><Text style={styles.account}>{contact.accountId}</Text></View>
            <Pressable onPress={() => router.push({ pathname: '/send', params: { accountId: contact.accountId } })}><Text style={styles.action}>Send</Text></Pressable>
            <Pressable onPress={() => remove(contact)}><Text style={styles.remove}>Remove</Text></Pressable>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    back: { color: colors.textPrimary, fontSize: 28 },
    title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
    body: { paddingHorizontal: 20, paddingTop: 16 },
    label: { color: colors.textMuted, fontSize: 13, marginBottom: 8, fontWeight: '500' },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: colors.textPrimary,
      fontSize: 16,
      marginBottom: 12,
    },
    primary: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      height: 54,
    },
    primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
    error: { color: colors.error, marginTop: 10, fontSize: 13 },
    section: { color: colors.textMuted, fontWeight: '700', fontSize: 13, letterSpacing: 0.5, marginTop: 28, marginBottom: 12 },
    muted: { color: colors.textMuted, textAlign: 'center', marginTop: 20, fontSize: 14 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
    },
    name: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
    account: { color: colors.textMuted, marginTop: 4, fontSize: 13 },
    action: { color: colors.primary, fontWeight: '700', fontSize: 14, paddingHorizontal: 8 },
    remove: { color: colors.error, fontSize: 13, fontWeight: '600', paddingHorizontal: 8 },
  });
}
