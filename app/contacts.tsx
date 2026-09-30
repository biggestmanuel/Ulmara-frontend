import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';

import { BackButton } from '../components/navigation/BackButton';
import {
  Button,
  EmptyState,
  IconButton,
  InitialsAvatar,
  Input,
  ListRow,
  LoadingSpinner,
  Screen,
  Sheet,
  Typography,
} from '../components/ui';
import { useContactsStore } from '../stores/contactsStore';
import { useUserStore } from '../stores/userStore';
import { formatAccountId } from '../lib/format';
import type { Contact } from '../lib/api/contacts';
import { gutter, radius, space, useThemeStore } from '../lib/theme';

type Mode = 'browse' | 'add' | 'edit';

/**
 * Contacts.
 *
 * All data is server-owned (`GET/POST/DELETE /api/contact`); see
 * `lib/api/contacts.ts` for the verified contract and the singular-path fix.
 *
 * ## What changed
 *
 * - Each contact was a **card** with a horizontal row of three bare icon buttons.
 *   A list of names does not need one box per entry: the rows are now a plain
 *   list with hairlines, and the per-contact actions are declared as data so each
 *   one gets a real accessible name. They are also 40pt `IconButton`s rather
 *   than 19pt glyphs inside an unlabelled `Pressable`.
 * - The form was inside a bordered card with its own labels. It is now a flat
 *   column using the shared `Input`, so each field owns its error and the
 *   Account ID formats as `0000 000 000` while you type — matching how it is
 *   presented in every other screen.
 * - The remove confirmation is a `Sheet`, which gives it a focus-trapping
 *   container and a named close control. Deleting a contact is destructive, so
 *   it names the contact and states that past transfers are unaffected.
 * - The "saved"/"removed" flash is a live-region toast rather than a floating
 *   box pinned above the list.
 */
function ContactsScreen() {
  const colors = useThemeStore((state) => state.colors);

  const contacts = useContactsStore((s) => s.contacts);
  const status = useContactsStore((s) => s.status);
  const error = useContactsStore((s) => s.error);
  const mutationError = useContactsStore((s) => s.mutationError);
  const isMutating = useContactsStore((s) => s.isMutating);
  const load = useContactsStore((s) => s.load);
  const add = useContactsStore((s) => s.add);
  const rename = useContactsStore((s) => s.rename);
  const remove = useContactsStore((s) => s.remove);
  const clearMutationError = useContactsStore((s) => s.clearMutationError);

  const ownAccountId = useUserStore((s) => s.accountId);

  const [mode, setMode] = useState<Mode>('browse');
  const [query, setQuery] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [accountIdDraft, setAccountIdDraft] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const nameInputRef = useRef<TextInput>(null);
  const accountIdInputRef = useRef<TextInput>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const resetForm = useCallback(() => {
    setMode('browse');
    setNameDraft('');
    setAccountIdDraft('');
    setEditing(null);
    clearMutationError();
  }, [clearMutationError]);

  const openAdd = useCallback(() => {
    clearMutationError();
    setNameDraft('');
    setAccountIdDraft('');
    setMode('add');
  }, [clearMutationError]);

  const openEdit = useCallback((contact: Contact) => {
    clearMutationError();
    setEditing(contact);
    setNameDraft(contact.name);
    setAccountIdDraft(contact.accountId ?? '');
    setMode('edit');
  }, [clearMutationError]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    const result =
      mode === 'edit' && editing
        ? await rename(editing.id, nameDraft)
        : await add({ name: nameDraft, accountId: accountIdDraft });

    if (result) {
      setFlash(mode === 'edit' ? 'Contact updated' : 'Contact saved');
      resetForm();
    }
  }, [mode, editing, rename, add, nameDraft, accountIdDraft, resetForm]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const ok = await remove(target.id);
    if (ok) setFlash(`${target.name} removed`);
  }, [pendingDelete, remove]);

  const goToSend = useCallback((contact: Contact) => {
    if (!contact.accountId) return;
    router.push({
      pathname: '/send',
      params: { accountId: contact.accountId, recipientName: contact.name },
    });
  }, []);

  const search = query.trim().toLowerCase();
  const filtered = search
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          (c.accountId ?? '').includes(query.replace(/\D/g, ''))
      )
    : contacts;

  const renderItem = useCallback(
    ({ item }: { item: Contact }) => (
      <ContactRow
        contact={item}
        onSend={goToSend}
        onEdit={openEdit}
        onRemove={setPendingDelete}
      />
    ),
    [goToSend, openEdit]
  );

  const keyExtractor = useCallback((item: Contact) => item.id, []);

  // Depends on the search text, so it is built here rather than hoisted.
  const emptyState = (
    <EmptyState
      icon={search ? 'search-outline' : 'people-outline'}
      title={search ? 'No matches' : 'No contacts yet'}
      body={
        search
          ? 'Nothing matches that search.'
          : 'Save the Account IDs you send to most so you can pay them in two taps.'
      }
      actionLabel={search ? undefined : 'Add a contact'}
      onAction={search ? undefined : openAdd}
    />
  );

  if (mode !== 'browse') {
    const isOwn = Boolean(ownAccountId) && accountIdDraft === ownAccountId;

    return (
      <Screen testID="contact-form">
        <View style={styles.header}>
          <BackButton onPress={resetForm} label="Cancel" />
          <Typography variant="titleSm" style={styles.headerTitle}>
            {mode === 'edit' ? 'Edit contact' : 'New contact'}
          </Typography>
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Input
            ref={nameInputRef}
            label="Name"
            placeholder="e.g. Ada Lovelace"
            value={nameDraft}
            onChangeText={setNameDraft}
            maxLength={100}
            returnKeyType="next"
            onSubmitEditing={() => accountIdInputRef.current?.focus()}
          />

          <Input
            ref={accountIdInputRef}
            label="Account ID"
            placeholder="0000 000 000"
            value={formatDraft(accountIdDraft)}
            onChangeText={(value) => setAccountIdDraft(value.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            maxLength={13}
            editable={mode !== 'edit'}
            hint={
              mode === 'edit'
                ? 'The Account ID cannot be changed. Remove this contact and add a new one instead.'
                : "The recipient's ten-digit Ulmara Account ID. You will find it on their profile."
            }
            error={isOwn ? 'That is your own Account ID' : undefined}
          />

          {mode === 'add' && accountIdDraft.length > 0 ? (
            <Typography variant="caption" color={colors.textMuted} numeric>
              {formatAccountId(accountIdDraft)}
            </Typography>
          ) : null}

          {mutationError ? (
            <Typography
              variant="label"
              color={colors.error}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {mutationError}
            </Typography>
          ) : null}

          <Button
            label={mode === 'edit' ? 'Save changes' : 'Save contact'}
            onPress={handleSave}
            loading={isMutating}
          />
          <Button label="Cancel" variant="ghost" onPress={resetForm} disabled={isMutating} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <>
      <Screen scroll={false} contentStyle={styles.screen} testID="contacts-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Contacts
          </Typography>
          <IconButton
            accessibilityLabel="Add contact"
            accessibilityHint="Opens a form to save a new Account ID"
            onPress={openAdd}
            variant="filled"
          >
            <Ionicons name="add" size={21} color={colors.primary} />
          </IconButton>
        </View>

        {contacts.length > 2 ? (
          <View style={styles.searchRow}>
            <Input
              placeholder="Search name or Account ID"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              containerStyle={styles.searchField}
            />
            {query.length > 0 ? (
              <IconButton
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
                size={40}
              >
                <Ionicons name="close-circle" size={19} color={colors.textMuted} />
              </IconButton>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBlock}>
            <EmptyState
              icon="cloud-offline-outline"
              title="Contacts unavailable"
              body={error}
              actionLabel="Try again"
              onAction={() => void load()}
            />
          </View>
        ) : (
          <FlashList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            // FlashList v2 measures rows itself; drawDistance keeps a small
            // prefetch buffer without the v1 `estimatedItemSize` prop.
            drawDistance={250}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              status === 'loading' ? (
                <LoadingSpinner size="large" label="Loading contacts" />
              ) : (
                emptyState
              )
            }
          />
        )}
      </Screen>

      {/* Deletion confirmation — deliberately explicit, this is destructive. */}
      <Sheet
        visible={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Remove contact?"
        subtitle={pendingDelete ? pendingDelete.name : undefined}
        footer={
          <>
            <Button
              label="Remove contact"
              variant="destructive"
              onPress={confirmDelete}
              loading={isMutating}
            />
            <Button label="Keep contact" variant="ghost" onPress={() => setPendingDelete(null)} />
          </>
        }
      >
        <Typography variant="body" color={colors.textSecondary}>
          {pendingDelete?.name} will be removed from your contacts. Any transfers you have already
          made to them are not affected.
        </Typography>
      </Sheet>

      {flash ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.flash, { backgroundColor: colors.textPrimary }]}
        >
          <Ionicons name="checkmark-circle" size={17} color={colors.background} />
          <Typography variant="label" color={colors.background}>
            {flash}
          </Typography>
        </View>
      ) : null}
    </>
  );
}

interface RowProps {
  contact: Contact;
  onSend: (contact: Contact) => void;
  onEdit: (contact: Contact) => void;
  onRemove: (contact: Contact) => void;
}

/**
 * Memoised so FlashList can recycle rows without re-rendering every visible item
 * when an unrelated contact is added or renamed.
 */
const ContactRow = memo(function ContactRow({ contact, onSend, onEdit, onRemove }: RowProps) {
  const canSend = contact.accountId !== null;
  const accountLabel = canSend ? formatAccountId(contact.accountId ?? '') : 'No Account ID';

  return (
    <ListRow
      title={contact.name}
      subtitle={accountLabel}
      showSeparator={false}
      leading={<InitialsAvatar initials={contact.name} size={40} />}
      onPress={canSend ? () => onSend(contact) : undefined}
      accessibilityLabel={canSend ? `${contact.name}, Account ID ${accountLabel}` : `${contact.name}, no Account ID`}
      accessibilityHint={canSend ? 'Starts a transfer to this contact' : undefined}
      actions={[
        { icon: 'create-outline', label: `Edit ${contact.name}`, onPress: () => onEdit(contact) },
        { icon: 'trash-outline', label: `Remove ${contact.name}`, onPress: () => onRemove(contact) },
      ]}
    />
  );
});

/** Groups the draft as the user types so the field previews the real format. */
function formatDraft(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (!clean) return '';
  return [clean.slice(0, 4), clean.slice(4, 7), clean.slice(7, 10)].filter(Boolean).join(' ');
}

const styles = StyleSheet.create({
  screen: { paddingTop: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.md },
  headerTitle: { flex: 1 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  searchField: { flex: 1 },

  list: {
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
    marginHorizontal: -gutter,
    paddingHorizontal: gutter,
  },

  errorBlock: { flex: 1, justifyContent: 'center' },

  formScroll: { flex: 1 },
  form: { gap: space.lg, paddingBottom: space.xxxl },

  flash: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: space.xxxl,
    marginHorizontal: gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.pill,
  },
});

export default ContactsScreen;
