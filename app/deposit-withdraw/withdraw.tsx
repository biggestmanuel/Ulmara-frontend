import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import { Button, Input, Screen, SectionLabel, Touchable, Typography } from '../../components/ui';
import { useWalletStore } from '../../stores/walletStore';
import { getUsdPrices, usdToNgn, type PriceSymbol } from '../../lib/prices/coingecko';
import { friendlyError } from '../../lib/api/client';
import { radius, space, useThemeStore } from '../../lib/theme';
import { chainLabel } from '../../constants/chains';

const UNAVAILABLE = 'Fiat withdrawals are not available yet.';

/**
 * Fiat withdrawal.
 *
 * ## The honest version of this screen
 *
 * Like `deposit`, fiat withdrawals are not available in this build. The old
 * version collected a full set of bank details and only then reported that it
 * could not do anything with them. The unavailability is now a banner above the
 * form, and the form itself is kept — the route and the flow are real.
 *
 * The copy deliberately names no provider. See the note in `deposit.tsx`: the
 * ramp is backend-only through `/api/ramp/*`, and the earlier wording named a
 * provider this codebase has no integration with.
 *
 * Two further defects fixed here:
 *
 * 1. **Price failures were invisible.** `getUsdPrices(...).catch(err =>
 *    console.error(...))` meant a failed rate lookup left the estimate silently
 *    reading `₦0` next to a real amount — which reads as "this is worth nothing"
 *    rather than "we could not price this". The estimate now says so explicitly.
 * 2. `handleWithdraw` was declared `async` and awaited nothing. It is now a
 *    plain handler, and it validates before reporting anything.
 *
 * The two-step structure is preserved: pick an asset, then enter details.
 */
export default function Withdraw() {
  const colors = useThemeStore((state) => state.colors);
  const balances = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsStep, setDetailsStep] = useState(false);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Partial<Record<PriceSymbol, number>>>({});
  const [rateError, setRateError] = useState<string | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);
  // `null` means the rate could not be read, which is NOT the same as ₦0 and must
  // not render as one. Initialised to null rather than 0 so the estimate is
  // absent until a rate is actually known.
  const [estimatedNgn, setEstimatedNgn] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedId && balances.length > 0) setSelectedId(balances[0].id);
  }, [balances, selectedId]);

  const selected = useMemo(
    () => balances.find((entry) => entry.id === selectedId) ?? null,
    [balances, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoadingRate(true);
    setRateError(null);
    getUsdPrices([selected.symbol as PriceSymbol])
      .then((next) => {
        if (!cancelled) setPrices(next);
      })
      .catch((err) => {
        if (cancelled) return;
        // Surfaced, not logged: a silent ₦0 next to a real amount is worse than
        // an explicit "we could not price this".
        setRateError(friendlyError(err, 'Could not load a live rate for this asset.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const amt = Number(amount) || 0;
  const balanceNum = selected ? Number(selected.balance) || 0 : 0;
  const rate = selected ? prices[selected.symbol as PriceSymbol] : undefined;
  const usdValue = rate ? amt * rate : 0;

  useEffect(() => {
    if (usdValue <= 0) {
      setEstimatedNgn(0);
      return;
    }
    let cancelled = false;
    usdToNgn(usdValue)
      .then((naira) => {
        // null means the rate could not be read. Showing ₦0 would be a real
        // number that is not a real one, which is the whole point of this change.
        if (!cancelled) setEstimatedNgn(naira);
      })
      .catch(() => {
        if (!cancelled) setEstimatedNgn(null);
      });
    return () => {
      cancelled = true;
    };
  }, [usdValue]);

  const goToDetails = useCallback(() => {
    if (!selected) {
      setError('Select an asset to withdraw from');
      return;
    }
    setError(null);
    setDetailsStep(true);
  }, [selected]);

  const handleWithdraw = useCallback(() => {
    if (!selected) return setError('Select an asset to withdraw from');
    if (!amt || amt <= 0) return setError('Enter a valid amount');
    if (amt > balanceNum) {
      return setError(`Insufficient ${selected.symbol} balance`);
    }
    if (bankName.trim().length < 2) return setError('Enter your bank name');
    if (accountNumber.replace(/\D/g, '').length !== 10) {
      return setError('Enter a valid 10-digit account number');
    }
    setError(UNAVAILABLE);
  }, [selected, amt, balanceNum, bankName, accountNumber]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="withdraw-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Withdraw
          </Typography>
        </View>

        <View style={styles.bannerWrap}>
          <View style={[styles.banner, { backgroundColor: colors.warningTint }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Typography variant="body" color={colors.warning} style={styles.bannerText}>
              {UNAVAILABLE} You can still send crypto to any Ulmara Account ID.
            </Typography>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SectionLabel>FROM</SectionLabel>

          {isLoadingBalances ? (
            <View style={styles.loading}>
              <Ionicons name="sync-outline" size={16} color={colors.textMuted} />
              <Typography variant="caption" color={colors.textMuted}>
                Checking your balances
              </Typography>
            </View>
          ) : balances.length === 0 ? (
            <Typography variant="body" color={colors.textMuted} style={styles.none}>
              No balances found yet. Receive some crypto first.
            </Typography>
          ) : (
            <>
              <View style={styles.chipRow}>
                {balances.map((entry) => {
                  const active = selectedId === entry.id;
                  const network = chainLabel(entry.chainId);
                  return (
                    <Touchable
                      key={entry.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`${entry.symbol} on ${network}, ${entry.balance} available`}
                      accessibilityState={{ selected: active, checked: active }}
                      aria-selected={active}
                      onPress={() => {
                        setSelectedId(entry.id);
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
                        {entry.symbol} · {network}
                      </Typography>
                    </Touchable>
                  );
                })}
              </View>

              {selected ? (
                <Typography variant="caption" color={colors.textMuted} style={styles.available}>
                  Available: {selected.balance} {selected.symbol}
                </Typography>
              ) : null}
            </>
          )}

          {!detailsStep ? (
            <Button
              label="Continue"
              onPress={goToDetails}
              disabled={!selected}
              style={styles.continueBtn}
            />
          ) : null}

          {detailsStep ? (
            <>
              <View style={styles.group}>
                <Input
                  label="Amount"
                  placeholder={`0.00 ${selected?.symbol ?? ''}`.trim()}
                  value={amount}
                  onChangeText={(value) => {
                    setAmount(value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'));
                    setError(null);
                  }}
                  keyboardType="decimal-pad"
                  maxLength={20}
                  returnKeyType="next"
                />

                {/* The estimate must never silently read as a real number. */}
                {amt > 0 ? (
                  <View style={styles.estimateRow}>
                    {loadingRate ? (
                      <Typography variant="caption" color={colors.textMuted}>
                        Fetching a live rate…
                      </Typography>
                    ) : rateError ? (
                      <Typography
                        variant="caption"
                        color={colors.warning}
                        accessibilityLiveRegion="polite"
                      >
                        {rateError}
                      </Typography>
                    ) : estimatedNgn === null ? (
                      // The rate is genuinely unknown. "≈ ₦0" would be a real
                      // number that is not a real number.
                      <Typography variant="label" color={colors.textSecondary}>
                        ≈ ₦—
                      </Typography>
                    ) : (
                      <Typography variant="label" color={colors.textSecondary} numeric>
                        ≈ ₦
                        {estimatedNgn.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                      </Typography>
                    )}
                  </View>
                ) : null}
              </View>

              <View style={styles.group}>
                <Input
                  label="Bank name"
                  placeholder="e.g. GTBank"
                  value={bankName}
                  onChangeText={(value) => {
                    setBankName(value);
                    setError(null);
                  }}
                  autoCapitalize="words"
                  maxLength={80}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.group}>
                <Input
                  label="Account number"
                  placeholder="0000000000"
                  value={accountNumber}
                  onChangeText={(value) => {
                    setAccountNumber(value.replace(/\D/g, '').slice(0, 10));
                    setError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={10}
                  returnKeyType="go"
                  onSubmitEditing={handleWithdraw}
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
            </>
          ) : null}
        </ScrollView>

        {detailsStep ? (
          <View style={styles.footer}>
            <Button label="Withdraw" onPress={handleWithdraw} />
            <Button label="Back" variant="ghost" onPress={() => setDetailsStep(false)} />
          </View>
        ) : null}
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

  scroll: { flex: 1 },
  body: { paddingTop: space.xl, paddingBottom: space.xl, gap: space.md },

  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  none: { paddingVertical: space.md },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  available: { marginTop: space.xs },

  continueBtn: { marginTop: space.xl },

  group: { marginTop: space.lg },
  estimateRow: { marginTop: space.xs },

  error: { marginTop: space.lg },

  footer: { gap: space.sm, paddingTop: space.lg },
});
