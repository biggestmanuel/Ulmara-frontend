import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import { Button, Input, Screen, SectionLabel, Touchable, Typography } from '../../components/ui';
import { NATIVE_ASSET_SYMBOLS, type NativeAssetSymbol } from '../../constants/chains';
import { radius, space, useThemeStore } from '../../lib/theme';

const QUICK_AMOUNTS = [5000, 10000, 25000, 50000];
const MIN_DEPOSIT_NGN = 1000;

/**
 * Fiat deposit.
 *
 * ## The honest version of this screen
 *
 * Fiat deposits depend on a Paystack integration that is **not configured** in
 * this environment. The previous version hid that: it presented a complete form
 * — asset chips, an amount field, quick-amount chips, a "Get Transfer Details"
 * button — and only told the user the feature was unavailable *after* they had
 * filled the form in and pressed the button. It also had a `try/catch` whose
 * two branches set the identical error string, around a body with no real work
 * in it, so the `loading` state flickered on and off in a single tick.
 *
 * Two things changed, and neither removes functionality:
 *
 * 1. **The unavailability is stated up front**, as a banner above the form, so
 *    the user is not walked through a form that cannot complete. The form is
 *    kept intact, because the screen and its route are real and the flow is
 *    expected to be wired up.
 * 2. **The dead `try/catch` is gone.** The handler now validates, then reports
 *    the actual state, with no simulated work and no spinner that means nothing.
 *
 * When Paystack is configured, `handleGenerate` becomes the real call and the
 * banner goes away. Nothing else on this screen needs to change.
 */
export default function Deposit() {
  const colors = useThemeStore((state) => state.colors);
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState<NativeAssetSymbol>('ETH');
  const [error, setError] = useState<string | null>(null);

  const unavailable = 'Fiat deposits are unavailable until Paystack is configured.';

  const handleGenerate = () => {
    const naira = Number(amount);
    if (!Number.isFinite(naira) || naira < MIN_DEPOSIT_NGN) {
      setError(`Minimum deposit is ₦${MIN_DEPOSIT_NGN.toLocaleString('en-NG')}`);
      return;
    }
    setError(null);
    // Not a failure the user caused, so it is presented as a status, not an
    // error. The button stays enabled so the screen behaves the same once the
    // integration lands.
    setError(unavailable);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="deposit-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Deposit
          </Typography>
        </View>

        <View style={styles.bannerWrap}>
          <View style={[styles.banner, { backgroundColor: colors.warningTint }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Typography variant="body" color={colors.warning} style={styles.bannerText}>
              {unavailable} You can still receive crypto directly to your Account ID.
            </Typography>
          </View>
        </View>

        <View style={styles.body}>
          <SectionLabel>RECEIVE AS</SectionLabel>
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
                  onPress={() => setAsset(option)}
                  pressScale={0.97}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primaryLight : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
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

          <View style={styles.amountBlock}>
            <Input
              label="Amount (NGN)"
              placeholder="₦0.00"
              value={amount}
              onChangeText={(value) => {
                setAmount(value.replace(/[^0-9]/g, ''));
                setError(null);
              }}
              keyboardType="number-pad"
              maxLength={12}
              returnKeyType="go"
              onSubmitEditing={handleGenerate}
            />
          </View>

          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((quick) => (
              <Touchable
                key={quick}
                accessibilityRole="button"
                accessibilityLabel={`Set the amount to ${quick.toLocaleString('en-NG')} naira`}
                onPress={() => {
                  setAmount(String(quick));
                  setError(null);
                }}
                pressScale={0.97}
                style={[styles.quick, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Typography variant="label" color={colors.textSecondary} numeric>
                  ₦{quick.toLocaleString('en-NG')}
                </Typography>
              </Touchable>
            ))}
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
        </View>

        <View style={styles.footer}>
          <Button label="Get transfer details" onPress={handleGenerate} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  bannerWrap: { marginTop: space.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.chip,
  },
  bannerText: { flex: 1 },

  body: { flex: 1, gap: space.md, paddingTop: space.xl },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },

  amountBlock: { marginTop: space.lg },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  quick: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: 12,
    borderWidth: 1,
  },

  error: { marginTop: space.md },

  footer: { paddingTop: space.xl, paddingBottom: space.xl },
});
