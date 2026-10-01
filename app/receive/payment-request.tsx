import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Button,
  Input,
  LoadingSpinner,
  Screen,
  SectionLabel,
  Touchable,
  Typography,
} from '../../components/ui';
import { NATIVE_ASSET_SYMBOLS, type NativeAssetSymbol } from '../../constants/chains';
import { useUserStore } from '../../stores/userStore';
import { createPaymentRequest } from '../../lib/api/transactions';
import { friendlyError } from '../../lib/api/client';
import { formatAccountId } from '../../lib/format';
import { radius, space, useThemeStore } from '../../lib/theme';

/**
 * Payment request.
 *
 * ## What changed
 *
 * - **An unhandled promise rejection.** `handleGenerate` called
 *   `createPaymentRequest` with no `try/catch` and no error state, so a failed
 *   request produced an unhandled rejection in the console and **no feedback at
 *   all** on screen — the button simply did nothing. It now has real validation
 *   with a message per field, a loading state, and a surfaced error.
 * - **13 pressables, none of them labelled.** The asset chips were unlabelled
 *   with no role or selection state; the "Done" control was a bare text link;
 *   both back controls were `‹` glyphs.
 * - It re-declared its own `formatAccountId` instead of using `lib/format`, so
 *   the ID could be grouped differently here than on every other screen.
 * - The generated state now shows the amount in the app's `amount` type step
 *   with tabular figures, because this is the number the sender is being asked
 *   for.
 */
export default function PaymentRequest() {
  const colors = useThemeStore((state) => state.colors);
  const accountId = useUserStore((state) => state.accountId) ?? '';

  const [asset, setAsset] = useState<NativeAssetSymbol>('ETH');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [generated, setGenerated] = useState(false);
  const [requestLink, setRequestLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    if (!accountId) {
      setError('Your Account ID is not available yet');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const request = await createPaymentRequest({ amount, symbol: asset, note });
      setRequestLink(request.link);
      setGenerated(true);
    } catch (err) {
      // Previously an unhandled rejection: the user pressed the button and
      // nothing happened, with no explanation anywhere.
      setError(friendlyError(err, 'Could not create that payment request. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [amount, accountId, asset, note]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Payment request: ${amount} ${asset}${note ? ` — ${note}` : ''}\n${requestLink}`,
      });
    } catch {
      // The user dismissed the share sheet. Not an error.
    }
  }, [amount, asset, note, requestLink]);

  const header = (title: string, onBack: () => void) => (
    <View style={styles.header}>
      <BackButton onPress={onBack} label={generated ? 'Edit request' : 'Go back'} />
      <Typography variant="titleSm" style={styles.headerTitle}>
        {title}
      </Typography>
    </View>
  );

  if (generated) {
    return (
      <Screen testID="payment-request-result">
        {header('Payment request', () => setGenerated(false))}

        <View style={styles.result}>
          {/* White plate on purpose: scanners need the light/dark inversion that
              the rest of the design deliberately avoids. */}
          <View style={styles.qrPlate}>
            <QRCode value={requestLink} size={180} />
          </View>

          <Typography variant="amount" numeric style={styles.requestAmount}>
            {amount} {asset}
          </Typography>
          {note ? (
            <Typography variant="body" color={colors.textMuted} style={styles.note}>
              {note}
            </Typography>
          ) : null}
          <Typography variant="caption" color={colors.textMuted} numeric style={styles.accountId}>
            {formatAccountId(accountId)}
          </Typography>
        </View>

        <View style={styles.footer}>
          <Button label="Share request" onPress={() => void handleShare()} />
          <Button label="Done" variant="ghost" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="payment-request-form">
        {header('Request amount', () => router.back())}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SectionLabel>ASSET</SectionLabel>
          <View style={styles.chipRow}>
            {NATIVE_ASSET_SYMBOLS.map((option) => {
              const active = asset === option;
              return (
                <Touchable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option}, native coin`}
                  accessibilityState={{ selected: active, checked: active }}
                  aria-selected={active}
                  onPress={() => {
                    setAsset(option);
                    setError(null);
                  }}
                  pressScale={0.97}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primaryLight : colors.surface,
                      borderColor: active ? colors.primary : colors.borderControl,
                    },
                  ]}
                >
                  <Typography variant="label" color={active ? colors.primary : colors.textMuted}>
                    {option}
                  </Typography>
                </Touchable>
              );
            })}
          </View>

          <View style={styles.group}>
            <Input
              label={`Amount (${asset})`}
              placeholder="0.00"
              value={amount}
              onChangeText={(value) => {
                setAmount(value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'));
                setError(null);
              }}
              keyboardType="decimal-pad"
              maxLength={24}
              returnKeyType="next"
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Note (optional)"
              placeholder="What is this for?"
              value={note}
              onChangeText={setNote}
              maxLength={140}
              returnKeyType="go"
              onSubmitEditing={() => void handleGenerate()}
            />
          </View>

          {error ? (
            <Typography
              variant="label"
              color={colors.error}
              style={styles.error}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {error}
            </Typography>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {saving ? (
            <View style={styles.saving}>
              <LoadingSpinner label="Creating your request" />
            </View>
          ) : (
            <Button label="Generate request" onPress={() => void handleGenerate()} />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  scroll: { flex: 1 },
  body: { paddingTop: space.xl, paddingBottom: space.xl, gap: space.md },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },

  group: { marginTop: space.lg },

  error: { marginTop: space.lg },

  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  qrPlate: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.card,
    padding: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAmount: { marginTop: space.lg },
  note: { textAlign: 'center', maxWidth: 320 },
  accountId: { marginTop: space.sm, letterSpacing: 1 },

  footer: { gap: space.sm, paddingTop: space.xl, paddingBottom: space.xl },
  saving: { alignItems: 'center', paddingVertical: space.md },
});
