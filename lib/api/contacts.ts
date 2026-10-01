import { apiClient } from './client';

/**
 * Contacts API.
 *
 * ## Backend contract (verified against ulmara-backend)
 *
 * `app.ts` mounts this router at the **singular** prefix `/api/contact`:
 *
 *   GET    /api/contact        -> Contact[]
 *   POST   /api/contact        -> Contact        (201)
 *   DELETE /api/contact/:id    -> { deleted: true }
 *
 * The previous client called `/api/contacts`, which does not exist — every
 * contact request 404'd and the screen reported "Contacts are unavailable".
 *
 * `Contact` rows are Prisma records: `{ id, ownerId, accountId, name, address,
 * chain, createdAt, updatedAt }`. There is no `note` or `photoUrl` column, so
 * the old interface's `note?`/`photoUrl?` fields never carried data and are
 * gone. `name` is `NOT NULL` and is the first half of a `@@unique([ownerId,
 * name])` constraint.
 *
 *   PATCH  /api/contact/:id    -> Contact        (same id)
 *
 * ## Edit support
 *
 * `PATCH /api/contact/:id` takes `{ name?, accountId? }` with at least one of the
 * two present, and answers with the updated row under its **original id**.
 *
 * There is no delete-and-recreate path. That fallback existed because the route
 * was missing, and it was wrong in two ways: it destroyed and recreated the row,
 * so the contact came back under a different id and anything already holding the
 * old one was orphaned; and it read a genuine 404 as "route absent", so editing
 * a contact that had been deleted elsewhere quietly deleted nothing and created
 * a duplicate instead of reporting the failure. It also could not work from a
 * browser, because CORS did not allow PATCH.
 */
const CONTACTS_PATH = '/api/contact';

export interface Contact {
  id: string;
  ownerId: string;
  /** 10-digit Ulmara Account ID, or null for an address-only contact. */
  accountId: string | null;
  name: string;
  address: string | null;
  /** UPPERCASE wire identifier when the contact is scoped to one chain. */
  chain: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Account IDs are exactly 10 digits, per the backend's zod schema. */
export const ACCOUNT_ID_RE = /^\d{10}$/;

export function isValidAccountId(value: string): boolean {
  return ACCOUNT_ID_RE.test(value.trim());
}

/** Digits-only normalisation, so "1234 567 890" and "1234567890" are equal. */
export function normalizeAccountId(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * The backend's zod schema requires `name` (1-100 chars). The old client sent
 * `name: undefined` when the user left the field blank, which produced a 400
 * whose message ("name: Invalid input") leaked straight into the UI.
 */
export function validateContactDraft(draft: {
  name: string;
  accountId: string;
}): string | null {
  const name = draft.name.trim();
  if (name.length === 0) return 'Enter a name for this contact.';
  if (name.length > 100) return 'That name is too long. Use 100 characters or fewer.';
  if (!isValidAccountId(draft.accountId)) return 'Enter a valid 10-digit Account ID.';
  return null;
}

/**
 * Rejects a save that the server's `@@unique([ownerId, name])` would reject.
 *
 * Without this the create hits a Prisma P2002 unique violation, which
 * `contactService.create` does not catch, so the user gets a bare
 * "Something went wrong" 500 instead of a reason they can act on.
 */
export function findConflictingName(
  contacts: Contact[],
  name: string,
  excludeId?: string
): Contact | undefined {
  const needle = name.trim().toLocaleLowerCase();
  return contacts.find(
    (contact) => contact.id !== excludeId && contact.name.trim().toLocaleLowerCase() === needle
  );
}

/** The backend keeps no uniqueness constraint on accountId, so we do. */
export function findDuplicateAccountId(
  contacts: Contact[],
  accountId: string,
  excludeId?: string
): Contact | undefined {
  const needle = normalizeAccountId(accountId);
  return contacts.find(
    (contact) => contact.id !== excludeId && normalizeAccountId(contact.accountId ?? '') === needle
  );
}

export async function listContacts(): Promise<Contact[]> {
  const { data } = await apiClient.get<ApiEnvelope<Contact[]>>(CONTACTS_PATH);
  return Array.isArray(data.data) ? data.data : [];
}

export async function createContact(input: { accountId: string; name: string }): Promise<Contact> {
  const { data } = await apiClient.post<ApiEnvelope<Contact>>(CONTACTS_PATH, {
    name: input.name.trim(),
    accountId: normalizeAccountId(input.accountId),
  });
  return data.data;
}

/**
 * Renames an existing contact, or repoints it at a different Account ID.
 *
 * Only the fields present in `input` are sent; the backend leaves the rest
 * alone. `accountId` is therefore omitted by a pure rename, which is what keeps
 * a rename from silently changing who the contact points at.
 *
 * Failures are thrown for the store to translate, and it uses the status to
 * pick the message:
 *  - 409 "You already have a contact with that name" — the name is taken.
 *  - 404 "Account ID not found" — the supplied Account ID belongs to nobody.
 *  - 404 — the contact does not exist, or is not the caller's.
 */
export async function updateContact(
  id: string,
  input: { name?: string; accountId?: string }
): Promise<Contact> {
  const name = input.name?.trim();
  const accountId =
    input.accountId === undefined ? undefined : normalizeAccountId(input.accountId);

  const body: { name?: string; accountId?: string } = {};
  if (name) body.name = name;
  if (accountId) body.accountId = accountId;

  // The backend requires at least one field. Posting `{}` would be a 400 that
  // reads like a server fault rather than a caller mistake, so the mistake is
  // named here.
  if (Object.keys(body).length === 0) {
    throw new Error('updateContact was called with neither a name nor an Account ID.');
  }

  const { data } = await apiClient.patch<ApiEnvelope<Contact>>(`${CONTACTS_PATH}/${id}`, body);
  return data.data;
}

/**
 * Deletes a contact.
 *
 * ## The empty-body trap
 *
 * The route takes no body, but axios sets `Content-Type: application/json` on
 * every request by default, and Fastify's content-type parser then rejects the
 * request before the handler runs:
 *
 * ```
 *   DELETE with Content-Type: application/json, no body  -> 400
 *     "Body cannot be empty when content-type is set to 'application/json'"
 *   DELETE with Content-Type: application/json, body {}  -> 200 { deleted: true }
 *   DELETE with no Content-Type at all                   -> 200 { deleted: true }
 * ```
 *
 * So the obvious `apiClient.delete(path)` fails with a 400 that reads like a
 * server bug and is not. An explicit empty object is sent to satisfy the parser;
 * it is the only shape that works *and* keeps the call site future-proof if the
 * route later accepts options.
 */
export async function deleteContact(id: string): Promise<void> {
  await apiClient.delete(`${CONTACTS_PATH}/${id}`, { data: {} });
}
