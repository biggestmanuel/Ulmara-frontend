import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Avatar,
  Button,
  EmptyState,
  LoadingSpinner,
  Screen,
  Typography,
} from '../../components/ui';
import {
  getPaymentLink,
  fulfillPaymentLink,
  fetchTransactions,
  type PaymentLink,
} from '../../lib/api/transactions';
import { useTxStore } from '../../stores/txStore';
import { friendlyError } from '../../lib/api/client';
import { formatAccountId } from '../../lib/format';
import { radius, space, useThemeStore } from '../../lib/theme';

/**
 * Fulfil a payment request.
 *
 * ## What changed
 *
 * - **Two error handlers threw away the real message.** `getPaymentLink(...).catch(() =>
 *   setError('This payment link is unavailable.'))` and a bare
 *   `catch { setError('Payment could not be completed…') }` both replaced
 *   whatever the server said with a generic guess. A 404 and a 500 became
 *   indistinguishable, and "no funds were sent" was asserted without knowing
 *   whether that was true. Both now go through `friendlyError`, and the
 *   "no funds were sent" claim is only made where it is known to be true.
 * - Five pressables, none labelled; the back control was a `‹` glyph with no role.
 * - The requester is identified with the shared `Avatar` and `formatAccountId`,
 *   so the Account ID is grouped the same way as everywhere else.
 * - The amount uses the `amount` type step with tabular figures — it is the
 *   number being asked for, and it is what the payer must verify.
 */
export default function PayLink() {
  const colors = useThemeStore((state) => state.colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [fulfilling, setFulfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('That link is missing a payment reference.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPaymentLink(id)
      .then((next) => {
        if (!cancelled) setLink(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(friendlyError(err, 'This payment link is unavailable.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const fulfill = useCallback(async () => {
    if (!id || !link || link.status !== 'OPEN') return;
    setFulfilling(true);
    setError(null);
    try {
      // The backend fulfills a request with the id of an existing COMPLETED
      // transfer from the payer (matching requester, asset, amount) — not
      // with amount/symbol. Find a qualifying sent transaction; if none
      // exists, tell the payer what to do instead of triggering a 400.
      const { items } = await fetchTransactions({ limit: 50 });
      const completedTransfer = items.find(
        (tx) =>
          tx.direction === 'sent' &&
          tx.status === 'complete' &&
          tx.counterpartyAccountId === link.requesterAccountId &&
          (!link.symbol || tx.symbol === link.symbol) &&
          (!link.amount || tx.amount === link.amount)
      );
      if (!completedTransfer) {
        setError(
          `No completed transfer to ${formatAccountId(link.requesterAccountId)} found yet.` +
            ` Send${link.amount ? ` ${link.amount}` : ''}${link.symbol ? ` ${link.symbol}` : ''} ` +
            'to them first, then pay this request.'
        );
        return;
      }
      const result = await fulfillPaymentLink(id, completedTransfer.id);
      useTxStore.getState().upsertTransaction(result.transaction);
      router.replace(`/transaction/${result.transaction.id}`);
    } catch (err) {
      // Only claim nothing moved when the request was rejected outright. The
      // backend is idempotent per attempt, so a timeout may still have landed;
      // saying "no funds were sent" unconditionally could be a lie.
      setError(friendlyError(err, 'Payment could not be completed. Check your activity before retrying.'));
    } finally {
      setFulfilling(false);
    }
  }, [id, link]);

  const header = (
    <View style={styles.header}>
      <BackButton />
      <Typography variant="titleSm" style={styles.headerTitle}>
        Payment request
      </Typography>
    </View>
  );

  if (loading) {
    return (
      <Screen testID="pay-loading">
        {header}
        <View style={styles.center}>
          <LoadingSpinner size="large" label="Loading this payment request" />
        </View>
      </Screen>
    );
  }

  if (error && !link) {
    return (
      <Screen testID="pay-error">
        {header}
        <View style={styles.center}>
          <EmptyState
            icon="alert-circle-outline"
            title="Request unavailable"
            body={error}
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  if (!link) return <Screen testID="pay-empty">{header}</Screen>;

  const closed = link.status !== 'OPEN';

  return (
    <Screen testID="pay-screen">
      {header}

      <View style={styles.body}>
        <View style={styles.card}>
          <Avatar name={link.requesterName || 'Ulmara user'} size={56} />
          <Typography variant="heading" style={styles.name}>
            {link.requesterName || 'Ulmara user'}
          </Typography>
          <Typography variant="caption" color={colors.textMuted} numeric>
            Account ID {formatAccountId(link.requesterAccountId)}
          </Typography>

          {link.amount ? (
            <View
              style={[styles.amountBox, { backgroundColor: colors.surfaceElevated }]}
              accessible
              accessibilityLabel={`Requesting ${link.amount} ${link.symbol ?? ''}`.trim()}
            >
              <Typography variant="amount" numeric>
                {link.amount} {link.symbol}
              </Typography>
            </View>
          ) : (
            <Typography variant="title" numeric style={styles.anyAmount}>
              Any amount
            </Typography>
          )}

          {link.note ? (
            <Typography variant="body" color={colors.textSecondary} style={styles.note}>
              {link.note}
            </Typography>
          ) : null}

          {closed ? (
            <View style={[styles.closed, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="close-circle-outline" size={17} color={colors.textMuted} />
              <Typography variant="label" color={colors.textSecondary}>
                This request is {link.status.toLowerCase()} and can no longer be paid.
              </Typography>
            </View>
          ) : (
            <View style={[styles.notice, { backgroundColor: colors.warningTint }]}>
              <Ionicons name="warning-outline" size={16} color={colors.warning} />
              <Typography variant="caption" color={colors.warning} style={styles.noticeText}>
                Paying records a transfer you have already made to{' '}
                {link.requesterName || 'this account'}. Check the amount and network before
                continuing.
              </Typography>
            </View>
          )}

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
      </View>

      {!closed ? (
        <View style={styles.footer}>
          <Button
            label="Pay request"
            onPress={() => void fulfill()}
            loading={fulfilling}
            disabled={fulfilling}
            accessibilityHint="Records this payment against the request"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  center: { flex: 1, justifyContent: 'center' },

  body: { flex: 1, justifyContent: 'center' },
  card: { alignItems: 'center' },

  name: { marginTop: space.md },
  amountBox: {
    borderRadius: radius.card,
    paddingVertical: space.xl,
    paddingHorizontal: space.xxl,
    marginTop: space.xl,
  },
  anyAmount: { marginTop: space.xl },

  note: { textAlign: 'center', marginTop: space.md, maxWidth: 320 },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.chip,
    marginTop: space.xl,
  },
  noticeText: { flex: 1 },

  closed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.chip,
    marginTop: space.xl,
  },

  error: { marginTop: space.lg, textAlign: 'center' },

  footer: { paddingTop: space.xl },
});
