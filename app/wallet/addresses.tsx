import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import {
  CopyToast,
  EmptyState,
  ListRow,
  Screen,
  Touchable,
  Typography,
  useCopyToast,
} from '../../components/ui';
import { useWalletStore } from '../../stores/walletStore';
import { gutter, radius, space, useThemeStore } from '../../lib/theme';

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum',
  bsc: 'BSC',
  base: 'Base',
  polygon: 'Polygon',
  sol: 'Solana',
  tron: 'TRON',
  ton: 'TON',
  btc: 'Bitcoin',
};

/**
 * Receiving addresses.
 *
 * ## What changed
 *
 * - Seven separate cards, one per network, each with its own border, padding and
 *   a full-width "Copy Address" button. Seven boxes for seven values of the same
 *   shape is a grid, and it is now a list of rows with hairlines.
 * - **The privacy toggle is now correct in substance, not just in appearance.**
 *   Previously the hidden state still rendered a live copy button that copied
 *   the real address, so a screen reader (and anyone who revealed-then-hid
 *   without noticing) could copy an address that was presented as hidden. The
 *   copy action is now genuinely disabled while hidden and reports that state.
 * - The header was a `‹` glyph in a `Pressable` with no role; it is a named
 *   `BackButton`.
 * - The warning is a real strip with an icon rather than a tinted box whose
 *   text was the *warning* colour on a *primary* background.
 */
export default function WalletAddresses() {
  const colors = useThemeStore((state) => state.colors);
  const { chain } = useLocalSearchParams<{ chain?: string }>();
  const addresses = useWalletStore((s) => s.addresses);
  const [revealed, setRevealed] = useState(false);
  const { copyToClipboard, message: toastMessage, visible: toastVisible } = useCopyToast();

  const entries = Object.entries(addresses).filter(
    ([chainId]) => !chain || chainId === chain
  );

  return (
    <>
      <Screen testID="addresses-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Receiving addresses
          </Typography>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="eye-off-outline" size={16} color={colors.primary} />
          <Typography variant="caption" color={colors.primary} style={styles.noticeText}>
            Addresses are hidden by default. Only reveal or copy one when you are depositing
            directly from a source you trust.
          </Typography>
        </View>

        <Touchable
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide all addresses' : 'Reveal all addresses'}
          accessibilityState={{ expanded: revealed }}
          onPress={() => setRevealed((value) => !value)}
          pressScale={0.98}
          style={[styles.reveal, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Ionicons
            name={revealed ? 'eye-off-outline' : 'eye-outline'}
            size={17}
            color={colors.primary}
          />
          <Typography variant="label" color={colors.primary}>
            {revealed ? 'Hide all addresses' : 'Reveal all addresses'}
          </Typography>
        </Touchable>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon="key-outline"
              title="No addresses yet"
              body="Your receiving addresses appear once the wallet has finished generating keys for this device."
            />
          </View>
        ) : (
          <View style={styles.list}>
            {entries.map(([chainId, address], index) => {
              const label = CHAIN_LABELS[chainId] ?? chainId.toUpperCase();
              return (
                <ListRow
                  key={chainId}
                  title={label}
                  subtitle={revealed ? address : 'Hidden'}
                  showSeparator={index < entries.length - 1}
                  // A monospace address is the one value in this app where
                  // visual truncation is acceptable — it stays `selectable` and
                  // fully present for assistive tech, and the middle-ellipsis
                  // keeps the first and last characters, which are the parts
                  // people actually compare.
                  trailing={
                    <Touchable
                      accessibilityRole="button"
                      accessibilityLabel={`Copy ${label} address`}
                      accessibilityHint={
                        revealed
                          ? 'Copies this address to your clipboard'
                          : 'Reveal the address first'
                      }
                      accessibilityState={{ disabled: !revealed }}
                      disabled={!revealed}
                      onPress={() => copyToClipboard(address, `${label} address copied`)}
                      pressScale={0.97}
                      style={styles.copy}
                    >
                      <Ionicons
                        name="copy-outline"
                        size={15}
                        color={revealed ? colors.primary : colors.textMuted}
                      />
                      <Typography variant="label" color={revealed ? colors.primary : colors.textMuted}>
                        Copy
                      </Typography>
                    </Touchable>
                  }
                />
              );
            })}
          </View>
        )}
      </Screen>

      <CopyToast message={toastMessage ?? ''} visible={toastVisible} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.chip,
    marginTop: space.lg,
  },
  noticeText: { flex: 1 },

  reveal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: space.md,
  },

  list: {
    marginTop: space.lg,
    marginHorizontal: -gutter,
    paddingHorizontal: gutter,
  },

  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },

  empty: { flex: 1, justifyContent: 'center' },
});
