import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { BackButton } from '../../components/navigation/BackButton';
import {
  AccountId,
  Button,
  CopyToast,
  Screen,
  SegmentedControl,
  Touchable,
  Typography,
  useCopyToast,
} from '../../components/ui';
import { useUserStore } from '../../stores/userStore';
import { formatAccountId } from '../../lib/format';
import { radius, space, useThemeStore } from '../../lib/theme';

// QR rendering uses react-native-qrcode-svg: black modules on a white plate,
// regardless of theme, for maximum scanner contrast. Scanners need the
// light/dark inversion that the rest of the design deliberately avoids.
type Method = 'QR Code' | 'Account ID' | 'Link';

/**
 * Receive.
 *
 * ## What changed
 *
 * - The method chips become a `SegmentedControl`, so the choice is announced as
 *   a tab list with a selected state. The old chips had no role at all.
 * - The QR code was in a 220pt box with an accent shadow and a 24pt radius. The
 *   shadow is gone — scanners do not benefit from elevation, and it was one of
 *   the last coloured glows in the app. It sits on a plain white plate with a
 *   hairline, which is also what every scanner expects.
 * - The Account ID uses the shared `AccountId` component, so the value is set
 *   identically here, on Home and on Profile: tabular figures, wide tracking,
 *   same size. Previously it was rendered three different ways.
 * - The share link is set in monospace and wraps, because it is a URL and
 *   truncating it mid-host is how people paste the wrong thing.
 */
export default function ReceiveIndex() {
  const colors = useThemeStore((state) => state.colors);
  const accountId = useUserStore((state) => state.accountId) ?? '';

  const [method, setMethod] = useState<Method>('QR Code');
  const { copyToClipboard, message: toastMessage, visible: toastVisible } = useCopyToast();

  const shareLink = `https://ulmara.app/pay/${accountId}`;

  const handleCopy = async () => {
    await copyToClipboard(
      method === 'Link' ? shareLink : accountId,
      method === 'Link' ? 'Payment link copied' : 'Account ID copied'
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Send me crypto via my Account ID: ${formatAccountId(accountId)}\n${shareLink}`,
      });
    } catch {
      // user cancelled or share failed silently
    }
  };

  return (
    <>
      <Screen testID="receive-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Receive
          </Typography>
        </View>

        <SegmentedControl<Method>
          accessibilityLabel="How to share your details"
          value={method}
          onChange={setMethod}
          options={[
            { value: 'QR Code', label: 'QR code' },
            { value: 'Account ID', label: 'Account ID' },
            { value: 'Link', label: 'Link' },
          ]}
        />

        <View style={styles.body}>
          {method === 'QR Code' ? (
            <>
              <View style={[styles.qrPlate, { borderColor: colors.border }]}>
                <QRCode value={shareLink} size={190} />
              </View>
              <Typography variant="title" numeric style={styles.idUnderQr}>
                {formatAccountId(accountId)}
              </Typography>
              <Typography variant="body" color={colors.textMuted} style={styles.helper}>
                Scan to send crypto straight to this account.
              </Typography>
            </>
          ) : null}

          {method === 'Account ID' ? (
            <View style={styles.idBlock}>
              <AccountId
                value={accountId}
                label="Your Account ID"
                onCopy={handleCopy}
              />
              <Typography variant="body" color={colors.textMuted} style={styles.helper}>
                Anyone can pay you with these ten digits. No address to copy, nothing to
                paste wrong.
              </Typography>
            </View>
          ) : null}

          {method === 'Link' ? (
            <View style={styles.linkBlock}>
              <Typography variant="label" color={colors.textSecondary}>
                SHAREABLE LINK
              </Typography>
              <Typography variant="code" style={[styles.link, { backgroundColor: colors.surfaceElevated }]}>
                {shareLink}
              </Typography>
              <Typography variant="body" color={colors.textMuted} style={styles.helper}>
                Opens your payment page in the Ulmara app or on the web.
              </Typography>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          {method === 'QR Code' ? (
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Copy Account ID"
              accessibilityHint="Copies your ten-digit Account ID"
              onPress={handleCopy}
              pressScale={0.97}
              style={styles.copyLink}
            >
              <Typography variant="label" color={colors.primary}>
                Copy Account ID instead
              </Typography>
            </Touchable>
          ) : (
            <Button
              label={method === 'Link' ? 'Copy link' : 'Copy Account ID'}
              variant="secondary"
              onPress={handleCopy}
            />
          )}

          <Button label="Share" onPress={handleShare} />

          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Request a specific amount"
            accessibilityHint="Creates a payment request you can send to someone"
            onPress={() => router.push('/receive/payment-request')}
            pressScale={0.97}
            style={styles.copyLink}
          >
            <Typography variant="label" color={colors.textSecondary}>
              Request a specific amount
            </Typography>
          </Touchable>
        </View>
      </Screen>

      <CopyToast message={toastMessage ?? ''} visible={toastVisible} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingVertical: space.xl },

  qrPlate: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  idUnderQr: { letterSpacing: 1.2 },
  helper: { textAlign: 'center', maxWidth: 320 },

  idBlock: { alignSelf: 'stretch', gap: space.lg },
  linkBlock: { alignSelf: 'stretch', gap: space.sm },
  link: { padding: space.md, borderRadius: radius.chip },

  footer: { gap: space.md },
  copyLink: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.md },
});
