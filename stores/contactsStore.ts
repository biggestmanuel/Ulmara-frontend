import { create } from 'zustand';

import {
  createContact,
  deleteContact,
  findConflictingName,
  findDuplicateAccountId,
  listContacts,
  normalizeAccountId,
  updateContact,
  validateContactDraft,
  type Contact,
} from '../lib/api/contacts';
import { friendlyError, toApiError } from '../lib/api/client';
import { useUserStore } from './userStore';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface ContactsState {
  contacts: Contact[];
  status: Status;
  /** Message for the list itself (load failure). */
  error: string | null;
  /** Message for the most recent mutation (add / edit / remove). */
  mutationError: string | null;
  isMutating: boolean;

  load: (options?: { silent?: boolean }) => Promise<void>;
  add: (draft: { name: string; accountId: string }) => Promise<Contact | null>;
  rename: (id: string, name: string) => Promise<Contact | null>;
  remove: (id: string) => Promise<boolean>;
  clearMutationError: () => void;
  reset: () => void;
}

/**
 * Contacts are server-owned, so this store is a cache of `GET /api/contact`
 * rather than a source of truth. Every mutation re-reads from the response the
 * server returned (create/update) or removes locally (delete) — nothing is
 * written optimistically, so the list can never drift from the backend.
 */
export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  status: 'idle',
  error: null,
  mutationError: null,
  isMutating: false,

  load: async ({ silent } = {}) => {
    if (!silent) set({ status: 'loading', error: null });
    try {
      const contacts = await listContacts();
      set({ contacts, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: friendlyError(err, 'We could not load your contacts.') });
    }
  },

  add: async (draft) => {
    set({ mutationError: null });

    const invalid = validateContactDraft(draft);
    if (invalid) {
      set({ mutationError: invalid });
      return null;
    }

    const name = draft.name.trim();
    const accountId = normalizeAccountId(draft.accountId);
    const { contacts } = get();

    // Client-side guards for the two constraints the backend either lacks or
    // enforces with a raw 500. Both produce actionable copy instead.
    if (findConflictingName(contacts, name)) {
      set({ mutationError: `You already have a contact named "${name}". Give this one a different name.` });
      return null;
    }
    if (findDuplicateAccountId(contacts, accountId)) {
      set({ mutationError: 'This Account ID is already in your contacts.' });
      return null;
    }
    const ownAccountId = useUserStore.getState().accountId;
    if (ownAccountId && accountId === ownAccountId) {
      set({ mutationError: 'This is your own Account ID. You cannot send to yourself.' });
      return null;
    }

    set({ isMutating: true });
    try {
      const created = await createContact({ accountId, name });
      set((state) => ({ contacts: [created, ...state.contacts] }));
      return created;
    } catch (err) {
      // The backend 404s when the Account ID is well-formed but belongs to
      // nobody. `friendlyError`'s generic 404 copy ("Not found. Please check
      // the details and try again.") does not say which field is wrong, so
      // the user has to guess. Name the field.
      if (toApiError(err).status === 404) {
        set({ mutationError: 'No Ulmara user has that Account ID. Check the digits and try again.' });
        return null;
      }
      set({ mutationError: friendlyError(err, 'We could not save this contact.') });
      return null;
    } finally {
      set({ isMutating: false });
    }
  },

  rename: async (id, name) => {
    set({ mutationError: null });

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      set({ mutationError: 'Enter a name for this contact.' });
      return null;
    }
    if (trimmed.length > 100) {
      set({ mutationError: 'That name is too long. Use 100 characters or fewer.' });
      return null;
    }

    const target = get().contacts.find((contact) => contact.id === id);
    if (!target) {
      set({ mutationError: 'That contact no longer exists. Refresh and try again.' });
      return null;
    }
    if (findConflictingName(get().contacts, trimmed, id)) {
      set({ mutationError: `You already have a contact named "${trimmed}".` });
      return null;
    }

    set({ isMutating: true });
    try {
      // A rename must never change which Account ID the contact resolves to.
      const updated = await updateContact(id, { name: trimmed, accountId: target.accountId ?? '' });
      set((state) => ({
        contacts: state.contacts.map((contact) => (contact.id === updated.id ? updated : contact)),
      }));
      return updated;
    } catch (err) {
      set({ mutationError: friendlyError(err, 'We could not update this contact.') });
      return null;
    } finally {
      set({ isMutating: false });
    }
  },

  remove: async (id) => {
    set({ mutationError: null });
    set({ isMutating: true });
    try {
      await deleteContact(id);
      set((state) => ({ contacts: state.contacts.filter((contact) => contact.id !== id) }));
      return true;
    } catch (err) {
      set({ mutationError: friendlyError(err, 'We could not remove this contact.') });
      return false;
    } finally {
      set({ isMutating: false });
    }
  },

  clearMutationError: () => set({ mutationError: null }),
  reset: () => set({ contacts: [], status: 'idle', error: null, mutationError: null, isMutating: false }),
}));
