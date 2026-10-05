import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Button,
  InitialsAvatar,
  Input,
  LoadingSpinner,
  Screen,
  SectionLabel,
  SegmentedControl,
  Touchable,
  Typography,
} from '../../components/ui';
import { ContactPicker } from '../../components/contacts/ContactPicker';
import { getTokensForChain } from '../../lib/api/tokens';
import { resolveAccountIdForTransfer, type AccountIdProfileWithAddresses } from '../../lib/api/accountId';
import { friendlyError } from '../../lib/api/client';
import { useContactsStore } from '../../stores/contactsStore';
import type { Contact } from '../../lib/api/contacts';
import { signingAdapters } from '../../lib/signing/chainAdapters';
import type { ChainId } from '../../lib/chains';
import { space, useThemeStore } from '../../lib/theme';

type TransferMode = 'ulmara' | 'external';

const NATIVE_ASSET_SYMBOLS = ['ETH', 'BNB', 'POL', 'SOL', 'TON', 'TRX', 'BTC'] as const;
const SIGNABLE_NATIVE_ASSETS = new Set(NATIVE_ASSET_SYMBOLS);

/**
 * Send — step 1: who and what.
 *
 * ## What changed
 *
 * - The transfer-type choice was two "mode cards" with `accessibilityRole="radio"`
 *   and no group. It is now a `SegmentedControl` (a labelled tab list), which is
 *   both correct for the semantics and shorter vertically, so the Account ID
 *   field is visible without scrolling on a small phone.
 * - The back control was a bare `‹` glyph in a `Pressable`; it is a real
 *   `BackButton` with an icon and a name.
 * - The asset chips become full-width selectable rows in a list, because the old
 *   wrapping chip row put a two-line label ("Transfer to external wallet") inside
 *   a 1-up card and the ERC-20 badges made the row ragged.
 * - The recipient field groups as `0000 000 000` as you type, which is how the
 *   ID is presented everywhere else in the app, and the resolved recipient is
 *   confirmed with a name **and** a tick, so a successful lookup is legible
 *   rather than implied by the absence of an error.
 */
export default function SendIndex() {
  const colors = useThemeStore((state) => state.colors);
  const params = useMemo(
    () => ({} as { asset?: string; accountId?: string; recipientName?: string }),
    []
  );

  const [transferMode, setTransferMode] = useState<TransferMode>('ulmara');
  const [accountId, setAccountId] = useState(params.accountId ?? '');
  const [asset, setAsset] = useState(params.asset ?? 'ETH');
  // Populated by `resolveAccountIdForTransfer`, the one endpoint of the two that
  // returns an address per wallet. `network-select.tsx` depends on that address
  // being present, and filters the array down to the entries that have one.
  const [profile, setProfile] = useState<AccountIdProfileWithAddresses | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const contacts = useContactsStore((s) => s.contacts);
  const loadContacts = useContactsStore((s) => s.load);

  // A contact name passed in from the picker is a display hint only — the
  // Account ID is always re-resolved against the API before it can be used.
  const [contactName, setContactName] = useState<string | null>(params.recipientName ?? null);

  /**
   * Tokens the backend says exist on a network this build can sign for.
   *
   * Populated asynchronously from `GET /api/wallet/tokens/:chain`, because the
   * local table only holds canonical *mainnet* addresses and the app runs on
   * Sepolia — where a mainnet address names nothing. Until the registry lands
   * this is empty rather than wrong: offering a token whose contract is not
   * deployed on the selected network is exactly the failure the registry exists
   * to prevent.
   */
  const [availableTokens, setAvailableTokens] = useState<{ symbol: string; name: string }[]>([]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const chains = (Object.keys(signingAdapters) as ChainId[]).filter(
        (chain) => signingAdapters[chain].availability === 'available'
      );
      const lists = await Promise.allSettled(chains.map((chain) => getTokensForChain(chain)));

      const seen = new Map<string, { symbol: string; name: string }>();
      for (const result of lists) {
        if (result.status !== 'fulfilled') continue;
        for (const token of result.value) {
          if (!seen.has(token.symbol)) {
            seen.set(token.symbol, { symbol: token.symbol, name: token.name });
          }
        }
      }
      if (!cancelled) setAvailableTokens([...seen.values()]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const digits = accountId.replace(/\D/g, '');
    setProfile(null);
    setContactName(null);
    if (digits.length !== 10) return;

    let cancelled = false;
    setResolving(true);
    resolveAccountIdForTransfer(digits)
      .then((resolved) => {
        if (cancelled) return;
        setProfile(resolved ?? null);
        if (!resolved) setError('No Ulmara account matches that Account ID.');
      })
      .catch((err) => {
        if (cancelled) return;
        setProfile(null);
        // The server's own message is the useful one. Verified against the
        // running backend: entering *your own* Account ID returns
        // 400 "Cannot resolve your own Account ID for transfer", which this
        // handler discarded in favour of "we could not look up that Account ID,
        // try again shortly" — telling the user to retry something that can
        // never succeed, and hiding the actual reason.
        setError(friendlyError(err, 'We could not look up that Account ID. Try again shortly.'));
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const handleSelectContact = useCallback((contact: Contact) => {
    if (!contact.accountId) return;
    setAccountId(contact.accountId);
    setContactName(contact.name);
    setError(null);
  }, []);

  const handleContinue = useCallback(() => {
    if (transferMode === 'external') {
      router.push({ pathname: '/send/external-wallet', params: { asset } });
      return;
    }
    if (!profile) {
      // The resolve effect above has already put the *accurate* reason on
      // screen — "No Ulmara account matches that Account ID." for a 404, or
      // "We could not look up that Account ID. Try again shortly." for a
      // transport/server failure. This handler used to clear the error first
      // and then blame the user's formatting, which destroyed the specific
      // message and misdirected the user.
      setError((prev) => prev ?? 'We could not look up that Account ID. Try again shortly.');
      return;
    }
    setError(null);
    router.push({
      pathname: '/send/amount',
      params: {
        accountId: profile.accountId,
        recipientName: contactName ?? profile.name ?? 'Ulmara user',
        asset,
        wallets: JSON.stringify(profile.wallets ?? []),
      },
    });
  }, [transferMode, profile, contactName, asset]);

  const displayName = contactName ?? profile?.name ?? null;
  const nativeAssets = NATIVE_ASSET_SYMBOLS.filter((symbol) => SIGNABLE_NATIVE_ASSETS.has(symbol));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="send-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Send
          </Typography>
        </View>

        <View style={styles.body}>
          <SectionLabel>TRANSFER TYPE</SectionLabel>
          <SegmentedControl<TransferMode>
            accessibilityLabel="Transfer type"
            value={transferMode}
            onChange={setTransferMode}
            options={[
              { value: 'ulmara', label: 'To an Account ID' },
              { value: 'external', label: 'To a wallet address' },
            ]}
          />

          {transferMode === 'external' ? (
            <Typography variant="caption" color={colors.textMuted} style={styles.riskNote}>
              External transfers cannot be reversed. Check the address and network carefully.
            </Typography>
          ) : null}

          {transferMode === 'ulmara' ? (
            <>
              <Touchable
                accessibilityRole="button"
                accessibilityLabel="Choose from contacts"
                accessibilityHint="Opens your saved contacts"
                onPress={() => setPickerOpen(true)}
                style={styles.contactsRow}
              >
                <Ionicons name="people-outline" size={17} color={colors.primary} />
                <Typography variant="titleSm" style={styles.contactsText}>
                  {contacts.length > 0 ? 'Choose from contacts' : 'Choose from contacts'}
                </Typography>
                {contacts.length > 0 ? (
                  <Typography variant="caption" color={colors.textMuted}>
                    {contacts.length}
                  </Typography>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Touchable>

              <View style={styles.recipientBlock}>
                <Input
                  label="Recipient Account ID"
                  placeholder="0000 000 000"
                  value={formatGrouped(accountId)}
                  onChangeText={(v) => setAccountId(v.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  error={error ?? undefined}
                  maxLength={13}
                />

                {resolving ? (
                  <View style={styles.resolveRow}>
                    <LoadingSpinner />
                    <Typography variant="caption" color={colors.textMuted}>
                      Looking up that Account ID
                    </Typography>
                  </View>
                ) : null}

                {profile && !resolving ? (
                  <View
                    style={[styles.recipientFound, { borderColor: colors.success }]}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`Recipient found: ${displayName ?? 'Ulmara user'}, Account ID ${formatGrouped(profile.accountId)}`}
                  >
                    <InitialsAvatar initials={displayName ?? 'U'} size={34} />
                    <View style={styles.recipientText}>
                      <Typography variant="titleSm" numberOfLines={1}>
                        {displayName ?? 'Ulmara user'}
                      </Typography>
                      <Typography variant="caption" color={colors.textMuted} numeric>
                        {formatGrouped(profile.accountId)}
                      </Typography>
                    </View>
                    <Ionicons name="checkmark-circle" size={19} color={colors.success} />
                  </View>
                ) : null}
              </View>

              <View style={styles.assetBlock}>
                <SectionLabel>ASSET</SectionLabel>
                <View style={styles.assetList}>
                  {nativeAssets.map((symbol) => (
                    <AssetRow
                      key={symbol}
                      symbol={symbol}
                      badge={null}
                      active={asset === symbol}
                      onPress={setAsset}
                    />
                  ))}
                  {availableTokens.map((token) => (
                    <AssetRow
                      key={token.symbol}
                      symbol={token.symbol}
                      badge="ERC-20"
                      active={asset === token.symbol}
                      onPress={setAsset}
                    />
                  ))}
                </View>
              </View>

              {availableTokens.length > 0 ? (
                <Typography variant="caption" color={colors.textMuted} style={styles.tokenHint}>
                  ERC-20 tokens are transferred on an EVM network. The network fee is always
                  paid in that network's native coin, not in the token.
                </Typography>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Button
            label={transferMode === 'external' ? 'Continue to wallet address' : 'Continue'}
            onPress={handleContinue}
            disabled={transferMode === 'ulmara' && !profile}
          />
        </View>
      </Screen>

      <ContactPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectContact}
      />
    </KeyboardAvoidingView>
  );
}

/** Groups a 10-digit run as `4 3 3`, matching the rest of the app. */
function formatGrouped(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean.length === 0) return '';
  const parts = [clean.slice(0, 4), clean.slice(4, 7), clean.slice(7, 10)].filter(Boolean);
  return parts.join(' ');
}

/**
 * One selectable asset.
 *
 * A full-width row rather than a wrapping chip: the ticker, its kind, and the
 * selection state are all readable at a glance, and a screen reader hears one
 * button that says what choosing it means.
 */
function AssetRow({
  symbol,
  badge,
  active,
  onPress,
}: {
  symbol: string;
  badge: string | null;
  active: boolean;
  onPress: (symbol: string) => void;
}) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <Touchable
      accessibilityRole="radio"
      accessibilityLabel={badge ? `${symbol}, ${badge} token` : `${symbol}, native coin`}
      accessibilityState={{ selected: active, checked: active }}
      aria-selected={active}
      onPress={() => onPress(symbol)}
      pressScale={0.98}
      style={[
        styles.assetRow,
        {
          backgroundColor: active ? colors.primaryLight : colors.surface,
          borderColor: active ? colors.primary : colors.borderControl,
        },
      ]}
    >
      <View style={styles.assetLeft}>
        <Typography variant="titleSm" color={active ? colors.primary : colors.textPrimary}>
          {symbol}
        </Typography>
        {badge ? (
          <Typography variant="micro" color={active ? colors.primary : colors.textMuted}>
            {badge}
          </Typography>
        ) : null}
      </View>
      {active ? <Ionicons name="checkmark" size={17} color={colors.primary} /> : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  body: { gap: space.lg, marginTop: space.lg },

  riskNote: { marginTop: -space.sm },

  contactsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.lg,
    backgroundColor: 'transparent',
  },
  contactsText: { flex: 1 },

  recipientBlock: { gap: space.md },
  resolveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recipientFound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  recipientText: { flex: 1, minWidth: 0 },

  assetBlock: { gap: space.sm },
  assetList: { gap: space.sm },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  assetLeft: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },

  tokenHint: { marginTop: -space.sm },

  footer: { marginTop: 'auto', paddingTop: space.xl },
});
