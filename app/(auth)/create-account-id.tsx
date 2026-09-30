import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button, LoadingSpinner, Screen, Typography } from '../../components/ui';
import { createAccountId, getMe } from '../../lib/api/accountId';
import { setSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { useAuthGateStore } from '../../stores/authGateStore';
import { friendlyError, toApiError } from '../../lib/api/client';
import { radius, space, useThemeStore } from '../../lib/theme';
import { formatAccountId } from '../../lib/format';
import { formatWalletSetupError } from '../../lib/walletSetupErrors';

/**
 * Account ID creation.
 *
 * ## The treatment
 *
 * The previous screen boxed the ID in a bordered "card" with 36pt of vertical
 * padding and centred it. This is the one screen where the ID is the *entire*
 * content, so it is set as large as the type scale allows, in the serif display
 * step, with tabular figures and generous tracking — on a quiet surface with a
 * hairline. The number is the artefact; the box was competing with it.
 *
 * The confirm button is disabled until the ID has actually been minted, and says
 * so via `accessibilityState` rather than by looking grey.
 */
export default function CreateAccountId() {
  const colors = useThemeStore((state) => state.colors);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkAuthGate = useAuthGateStore((s) => s.check);

  // The backend assigns and persists the Account ID the moment this is called —
  // there's no preview/reserve step and no way to pick your own ID. If the user
  // already has one (e.g. they backed out and returned to this screen),
  // createAccountId() 409s, so fall back to fetching the existing one.
  const fetchId = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createAccountId();
      setAccountId(result.accountId);
    } catch (err) {
      if (toApiError(err).status === 409) {
        try {
          const me = await getMe();
          setAccountId(me?.accountId?.accountId ?? null);
        } catch (meErr) {
          setError(friendlyError(meErr, 'Could not load your Account ID.'));
        }
      } else {
        setError(friendlyError(err, 'Could not create your Account ID.'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchId();
  }, [fetchId]);

  const handleConfirm = async () => {
    if (!accountId) return;
    setConfirming(true);
    setError(null);
    try {
      await setSecureItem(SecureStorageKeys.ACCOUNT_ID, accountId);

      // Generates keys for every supported chain, persists mnemonics locally, and
      // registers only public addresses with the backend. The session token
      // (needed for auth) was already stored back at signup/login.
      // Dynamic import: registerWallets.ts (and keyGeneration.ts beneath it)
      // must not load at screen-mount time, or @ton/ton crashes before this
      // component even renders — see lib/registerWallets.ts for details.
      const { setupNonCustodialWallet } = await import('../../lib/registerWallets');
      await setupNonCustodialWallet();

      await checkAuthGate();
      router.replace('/(tabs)/home');
    } catch (err) {
      // Debuggable from the UI alone: WalletGenerationStepError (chain + step)
      // and setup-stage failures surface as "Wallet setup failed at <chain>
      // <step>", so a report pinpoints the failing chain without logs.
      // formatWalletSetupError is dependency-free — this file must not
      // statically import keyGeneration.ts (see registerWallets.ts).
      const { headline, detail } = formatWalletSetupError(err);
      setError(headline);
      if (detail) console.error('[create-account-id] wallet setup failure:', detail);
    } finally {
      setConfirming(false);
    }
  };

  const busy = loading || confirming;

  return (
    <Screen>
      <View style={styles.body}>
        <Typography variant="title" style={styles.title}>
          Your Account ID
        </Typography>
        <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
          This is how people will send you crypto. It is unique to you and cannot be
          changed later.
        </Typography>

        <View
          style={[styles.idPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessible={Boolean(accountId)}
          accessibilityLabel={accountId ? `Your Account ID is ${formatAccountId(accountId)}` : undefined}
        >
          {loading || !accountId ? (
            <LoadingSpinner size="large" label="Creating your Account ID" />
          ) : (
            <Typography variant="title" numeric style={styles.idText}>
              {formatAccountId(accountId)}
            </Typography>
          )}
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
        <Button
          label="Confirm and continue"
          onPress={handleConfirm}
          loading={confirming}
          disabled={busy}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: space.xxxl },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: space.md, maxWidth: 320 },

  idPanel: {
    width: '100%',
    borderRadius: radius.card,
    borderWidth: 1,
    paddingVertical: space.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xxl,
    minHeight: 116,
  },
  idText: { fontSize: 32, lineHeight: 40, letterSpacing: 1.5 },

  error: { marginTop: space.xl, textAlign: 'center' },

  footer: { marginTop: 'auto', paddingTop: space.xxl },
});
