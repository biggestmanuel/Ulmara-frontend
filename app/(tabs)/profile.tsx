import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useUserStore } from '../../stores/userStore';
import { useAuthGateStore } from '../../stores/authGateStore';
import { useThemeStore } from '../../lib/theme';
import { deleteAccount } from '../../lib/api/auth';
import type { ApiErrorShape } from '../../lib/api/client';
import { useCopyToast, CopyToast } from '../../components/ui/CopyToast';

function formatAccountId(id?: string | null): string {
  if (!id) return '---- --- ---';
  return id.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

export default function ProfileScreen() {
  const { colors, isDark } = useThemeStore();
  const accountId = useUserStore((s) => s.accountId);
  const profile = useUserStore((s) => s.profile);
  const logout = useUserStore((s) => s.logout);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { copyToClipboard, message: toastMessage, visible: toastVisible } = useCopyToast();

  const displayName = profile?.name?.trim() || 'Biggest Manuel';
  const email = profile?.email || 'user@ulmara.io';
  const initial = displayName.charAt(0).toUpperCase();

  const handleCopyId = async () => {
    if (accountId) {
      await copyToClipboard(accountId, 'Account ID copied to clipboard');
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    router.replace('/(auth)/welcome');
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      // Server-side wipe first; if it fails, keep the session so the user
      // can retry instead of being stranded logged-out with a live account.
      await deleteAccount();
      setShowDeleteModal(false);
      await logout();
      await useAuthGateStore.getState().check();
      router.replace('/(auth)/welcome');
    } catch (err) {
      setDeleteError((err as ApiErrorShape).message ?? 'Could not delete your account. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.screenHeading, { color: colors.textPrimary }]}>Profile</Text>

        {/* User Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatarBig, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarBigText}>{initial}</Text>
          </View>
          <Text style={[styles.profileName, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{email}</Text>

          {/* Account ID Pill */}
          <Pressable
            style={[styles.idCardPill, { backgroundColor: isDark ? colors.surfaceElevated : colors.primaryLight }]}
            onPress={handleCopyId}
          >
            <View style={styles.idContent}>
              <Text style={[styles.idCardPillText, { color: colors.primary }]}>
                ID: {formatAccountId(accountId)}
              </Text>
              <Ionicons name="copy-outline" size={14} color={colors.primary} />
            </View>
          </Pressable>
        </View>

        {/* Menu Items */}
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={styles.menuRow}
            onPress={() => router.push('/settings' as any)}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="settings-outline" size={20} color={colors.primary} />
              <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Log out */}
        <Pressable
          style={[styles.logoutBtn, { borderColor: colors.error }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>Log Out</Text>
        </Pressable>

        {/* Delete account (permanent) */}
        <Pressable
          style={styles.deleteAccountBtn}
          onPress={() => {
            setDeleteError(null);
            setShowDeleteModal(true);
          }}
        >
          <Text style={[styles.deleteAccountText, { color: colors.textMuted }]}>Delete Account</Text>
        </Pressable>

        <Modal
          visible={showLogoutModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLogoutModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.logoutModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Log out?</Text>
              <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
                Are you sure you want to log out of Ulmara?
              </Text>
              <View style={styles.modalActions}>
                <Pressable style={styles.modalButton} onPress={() => setShowLogoutModal(false)}>
                  <Text style={[styles.modalButtonText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalButton, { backgroundColor: colors.error }]} onPress={confirmLogout}>
                  <Text style={styles.confirmButtonText}>Log Out</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Delete account confirmation — same modal design, destructive copy */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.logoutModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.error }]}>Delete account?</Text>
              <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
                This permanently deletes your account, wallets and transaction history. This
                cannot be undone.
              </Text>
              {deleteError && <Text style={[styles.deleteError, { color: colors.error }]}>{deleteError}</Text>}
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalButton}
                  onPress={() => setShowDeleteModal(false)}
                  disabled={deleting}
                >
                  <Text style={[styles.modalButtonText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, { backgroundColor: colors.error, opacity: deleting ? 0.6 : 1 }]}
                  onPress={confirmDeleteAccount}
                  disabled={deleting}
                >
                  <Text style={styles.confirmButtonText}>{deleting ? 'Deleting…' : 'Delete Forever'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Copy confirmation — styled to match the modals above */}
        <CopyToast message={toastMessage ?? ''} visible={toastVisible} onHide={() => {}} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingVertical: 20 },
  screenHeading: { fontSize: 24, fontWeight: '800', marginBottom: 18 },
  profileCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarBig: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarBigText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  profileName: { fontSize: 18, fontWeight: '800' },
  profileEmail: { fontSize: 13, marginTop: 4 },
  idCardPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 14,
  },
  idCardPillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  idContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuLabel: { fontSize: 15, fontWeight: '700' },
  arrow: { fontSize: 16, fontWeight: '700' },
  logoutBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '800' },
  deleteAccountBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  deleteAccountText: { fontSize: 13, fontWeight: '600' },
  deleteError: { fontSize: 13, marginTop: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoutModal: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalMessage: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  modalButton: {
    minWidth: 86,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalButtonText: { fontSize: 13, fontWeight: '800' },
  confirmButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});