import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import { AmountInput } from '../../components/send/AmountInput';
import {
  Button,
  ListRow,
  LoadingSpinner,
  Screen,
  Touchable,
  Typography,
} from '../../components/ui';
import { useWalletStore } from '../../stores/walletStore';
import { isTokenSymbol, getTokenForChain } from '../../constants/tokens';
import { radius, space, useThemeStore } from '../../lib/theme';

/**
 * Send — step 2: how much.
 *
 * ## What changed
 *
 * - The amount field is the shared `AmountInput`, which is labelled, uses
 *   tabular figures and has somewhere to put its error. The old field was a bare
 *   40pt number with the validation message stranded in the "quick chips" row
 *   next to the Max/50% buttons, where it looked like it belonged to them.
 * - Max and 50% are `Button`s in a real row, so they have names, targets and
 *   disabled states.
 * - Balances are `ListRow`s with hairlines instead of rows of bordered boxes.
 * - The ERC-20 notice keeps its content but is a quiet informational strip
 *   rather than a tinted box, and it states the decimal count because that is
 *   what the user is about to be constrained by.
 */
export default function SendAmount() {
  const colors = useThemeStore((state) => state.colors);
  const params = useLocalSearchParams<{
    accountId?: string;
    recipientName?: string;
    asset?: string;
    wallets?: string;
  }>();

  const asset = params.asset ?? 'ETH';
  const isToken = isTokenSymbol(asset);
  const decimals = isToken ? (getTokenForChain(asset, 'eth')?.decimals ?? 6) : 18;

  const holdings = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);

  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    router.setParams({ showAll: showAll ? '1' : undefined });
  }, [showAll]);

  const visibleHoldings = useMemo(
    () => holdings.filter((entry) => entry.symbol === asset),
    [holdings, asset]
  );

  const totalHolding = useMemo(
    () => visibleHoldings.reduce((sum, entry) => sum + (Number(entry.balance) || 0), 0),
    [visibleHoldings]
  );

  const setMax = useCallback(() => {
    // A token transfer still needs a little native coin for gas, so "max" on a
    // token is the full token balance; the fee is warned about separately rather
    // than silently deducted, because the fee is not knowable client-side.
    if (totalHolding > 0) {
      setAmount(String(Number(totalHolding.toFixed(decimals))));
      setError(null);
    }
  }, [totalHolding, decimals]);

  const setHalf = useCallback(() => {
    const half = totalHolding / 2;
    if (half > 0) {
      setAmount(String(Number(half.toFixed(decimals))));
      setError(null);
    }
  }, [totalHolding, decimals]);

  const shown = showAll ? visibleHoldings : visibleHoldings.slice(0, 3);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="send-amount-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Amount
          </Typography>
        </View>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Typography variant="body" color={colors.textMuted} style={styles.caption}>
            Sending {asset} to {params.recipientName ?? 'your recipient'}
          </Typography>

          {isToken ? (
            <View style={[styles.notice, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <Typography variant="caption" color={colors.primary} style={styles.noticeText}>
                {asset} is an ERC-20 token with {decimals} decimals. The network fee for this
                transfer is paid in that network's native coin, not in {asset}.
              </Typography>
            </View>
          ) : null}

          <View style={styles.amountBlock}>
            <AmountInput
              value={amount}
              onChangeText={(value) => {
                // Strip anything the decimal pad cannot produce, so state can
                // never hold a value the parser would reject for the wrong reason.
                const next = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                setAmount(next);
                setError(null);
              }}
              symbol={asset}
              error={error}
            />
          </View>

          <View style={styles.quickRow}>
            <Button
              label="Max"
              variant="secondary"
              size="sm"
              onPress={setMax}
              disabled={totalHolding <= 0}
              style={styles.quickBtn}
            />
            <Button
              label="50%"
              variant="secondary"
              size="sm"
              onPress={setHalf}
              disabled={totalHolding <= 0}
              style={styles.quickBtn}
            />
          </View>

          <View style={styles.holdingsBlock}>
            <View style={styles.holdingsHeader}>
              <Typography variant="label" color={colors.textSecondary}>
                Available
              </Typography>
              {isLoadingBalances ? <LoadingSpinner /> : null}
            </View>

            {visibleHoldings.length === 0 ? (
              <Typography variant="body" color={colors.textMuted} style={styles.noBalance}>
                {isLoadingBalances
                  ? 'Checking your balances'
                  : totalHolding === 0
                    ? `You have no ${asset} balance to send.`
                    : 'No balance found.'}
              </Typography>
            ) : (
              shown.map((holding, index) => (
                <ListRow
                  key={holding.id}
                  title={holding.chainId.toUpperCase()}
                  showSeparator={index < shown.length - 1}
                  trailing={
                    <Typography variant="amountSm" numeric>
                      {Number(holding.balance).toFixed(Math.min(decimals, 6))} {asset}
                    </Typography>
                  }
                />
              ))
            )}

            {visibleHoldings.length > 3 ? (
              <Touchable
                accessibilityRole="button"
                accessibilityLabel={showAll ? 'Show fewer networks' : `Show all ${visibleHoldings.length} networks`}
                accessibilityState={{ expanded: showAll }}
                onPress={() => setShowAll((v) => !v)}
                pressScale={0.97}
                style={styles.showMore}
              >
                <Typography variant="label" color={colors.primary}>
                  {showAll ? 'Show less' : `Show all ${visibleHoldings.length} networks`}
                </Typography>
              </Touchable>
            ) : null}
          </View>
        </ScrollView>

        <Button
          label="Continue"
          onPress={() =>
            router.push({
              pathname: '/send/confirm',
              params: {
                accountId: params.accountId,
                recipientName: params.recipientName,
                asset,
                amount,
                wallets: params.wallets,
              },
            })
          }
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  bodyScroll: { flex: 1 },
  body: { paddingTop: space.lg, paddingBottom: space.xl, gap: space.lg },
  caption: { textAlign: 'center' },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.chip,
  },
  noticeText: { flex: 1 },

  amountBlock: { alignItems: 'center', paddingVertical: space.xl },

  quickRow: { flexDirection: 'row', gap: space.md },
  quickBtn: { flex: 1 },

  holdingsBlock: { gap: space.xs },
  holdingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noBalance: { textAlign: 'center', paddingVertical: space.md },
  showMore: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.md },
});
