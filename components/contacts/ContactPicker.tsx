import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { EmptyState, Input, ListRow, LoadingSpinner, Sheet } from '../ui';
import { useContactsStore } from '../../stores/contactsStore';
import { formatAccountId } from '../../lib/format';
import type { Contact } from '../../lib/api/contacts';
import { gutter, space } from '../../lib/theme';

interface ContactPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: Contact) => void;
  /** Pre-fills the picker's search box, e.g. from the amount already typed. */
  initialQuery?: string;
}

/**
 * Bottom-sheet contact picker used by the send flow.
 *
 * Selecting a contact hands back the Contact, and the caller writes its Account
 * ID into the recipient field. The picker's own search is a convenience over a
 * list that is already small; it never becomes the source of truth for which
 * Account ID is sent — that always comes from the resolved profile.
 *
 * ## What changed
 *
 * This was a hand-rolled `Modal` with its own overlay, backdrop, grabber, sheet
 * body and close control. Two real defects came with that:
 *
 * 1. **The close button measured 22×24pt.** It was a bare `Pressable` wrapped
 *    around a 22pt glyph with `hitSlop={10}`, so the *touch* target was ~42pt on
 *    device but the *element* — what a screen reader focuses, what a switch
 *    -access user hits, and what the web build actually measures — was 22×24.
 *    The shared `IconButton` guarantees a 44pt box as a property of the
 *    component rather than a number typed into a style.
 * 2. **It did not dismiss reliably.** The overlay was a `Pressable` that called
 *    `onClose`, and the close control was a second, separate `Pressable` doing
 *    the same thing, with no shared dismissal path and no `onRequestClose`
 *    behaviour beyond the modal-level pass-through. The `Sheet` has one
 *    dismissal path, a real focus-trapping container, and handles the Android
 *    hardware back button.
 *
 * The empty state is also now the shared `EmptyState` (glyph, copy, and a route
 * to the thing that fixes it) rather than a hand-assembled block.
 */
function ContactPickerComponent({ visible, onClose, onSelect, initialQuery }: ContactPickerProps) {
  const status = useContactsStore((s) => s.status);
  const error = useContactsStore((s) => s.error);
  const load = useContactsStore((s) => s.load);
  // Subscribed, not read through `getState()`: a picker that is open while a
  // contact is added or renamed elsewhere has to show the new list, and
  // `getState()` inside a `useMemo` would silently never update.
  const contacts = useContactsStore((s) => s.contacts);

  const [query, setQuery] = useState('');

  // Load on first open so the sheet is never shown empty while data is in
  // flight. `silent` avoids flipping the store back into its loading state and
  // making the sheet flash a spinner on every open.
  useEffect(() => {
    if (!visible) return;
    if (status === 'idle' || status === 'error') void load({ silent: true });
  }, [visible, status, load]);

  useEffect(() => {
    if (visible) setQuery(initialQuery ?? '');
  }, [visible, initialQuery]);

  const filtered = useMemo(() => {
    const selectable = contacts.filter((contact) => contact.accountId !== null);
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return selectable;
    const digits = needle.replace(/\D/g, '');
    return selectable.filter((contact) => {
      if (contact.name.toLocaleLowerCase().includes(needle)) return true;
      return digits ? (contact.accountId ?? '').includes(digits) : false;
    });
  }, [contacts, query]);

  const handleSelect = useCallback(
    (contact: Contact) => {
      onSelect(contact);
      onClose();
    },
    [onSelect, onClose]
  );

  const renderItem = useCallback(
    ({ item }: { item: Contact }) => <PickerRow contact={item} onSelect={handleSelect} />,
    [handleSelect]
  );

  const keyExtractor = useCallback((item: Contact) => item.id, []);

  const empty = useMemo(() => {
    if (status === 'loading') {
      return <LoadingSpinner size="large" label="Loading contacts" />;
    }
    if (error) {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title="Contacts unavailable"
          body={error}
          actionLabel="Try again"
          onAction={() => void load()}
        />
      );
    }
    return (
      <EmptyState
        icon={query.trim() ? 'search-outline' : 'people-outline'}
        title={query.trim() ? 'No matches' : 'No saved contacts'}
        body={
          query.trim()
            ? 'Try a different name or Account ID.'
            : 'Save someone from Contacts and you can pay them in two taps.'
        }
      />
    );
  }, [status, error, query, load]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Send to a contact"
      subtitle="Search by name or Account ID"
    >
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
      </View>

      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        drawDistance={250}
        // The sheet already constrains its own height; the list only needs to
        // fill what is left.
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={empty}
      />
    </Sheet>
  );
}

const PickerRow = memo(function PickerRow({
  contact,
  onSelect,
}: {
  contact: Contact;
  onSelect: (contact: Contact) => void;
}) {
  return (
    <ListRow
      title={contact.name}
      subtitle={formatAccountId(contact.accountId ?? '')}
      showSeparator={false}
      onPress={() => onSelect(contact)}
      accessibilityLabel={`Select ${contact.name}`}
      accessibilityHint={`Account ID ${formatAccountId(contact.accountId ?? '')}`}
    />
  );
});

const styles = {
  searchRow: { flexDirection: 'row' as const, marginBottom: space.md },
  searchField: { flex: 1 },
  list: { flexGrow: 0, maxHeight: 320 },
  listContent: {
    marginHorizontal: -gutter,
    paddingHorizontal: gutter,
    paddingBottom: space.sm,
  },
};

export const ContactPicker = memo(ContactPickerComponent);
