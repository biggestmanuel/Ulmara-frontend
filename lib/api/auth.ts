import { apiClient } from './client';

export interface AuthUser {
  id: string;
  email: string;
  phone?: string | null;
  name?: string | null;
  photoUrl?: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  [key: string]: unknown;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
  devVerificationCodes?: {
    email: string;
    phone?: string;
  };
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export async function signup(input: {
  email: string;
  phone?: string;
  password: string;
}): Promise<AuthResult> {
  const { data } = await apiClient.post<ApiEnvelope<AuthResult>>('/api/auth/signup', input);
  return data.data;
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const { data } = await apiClient.post<ApiEnvelope<AuthResult>>('/api/auth/login', input);
  return data.data;
}

/**
 * The caller is identified by the session token, which `signup` (or `login`)
 * already stored and cached before this screen is reachable. The backend
 * validates only `code`: it previously also accepted a body-supplied `userId`,
 * which let an authenticated caller complete verification for an arbitrary
 * account, so that field was removed server-side and must not be sent here.
 */
export async function verifyEmail(input: { code: string }): Promise<AuthUser> {
  const { data } = await apiClient.post<ApiEnvelope<AuthUser>>('/api/auth/verify-email', {
    code: input.code,
  });
  return data.data;
}

export async function verifyPhone(input: { code: string }): Promise<AuthUser> {
  const { data } = await apiClient.post<ApiEnvelope<AuthUser>>('/api/auth/verify-phone', {
    code: input.code,
  });
  return data.data;
}

export async function resendCode(input: {
  channel: 'email' | 'phone';
}): Promise<{ success: boolean; devCode?: string }> {
  const { data } = await apiClient.post<ApiEnvelope<{ success: boolean; devCode?: string }>>(
    '/api/auth/resend-code',
    { channel: input.channel }
  );
  return data.data;
}

export async function forgotPassword(input: {
  email: string;
}): Promise<{ success: boolean; resetToken?: string }> {
  const { data } = await apiClient.post<ApiEnvelope<{ success: boolean; resetToken?: string }>>(
    '/api/auth/forgot-password',
    input
  );
  return data.data;
}

// PIN is verified server-side, not device-local — matches the OPay/PalmPay/
// Moniepoint model: set once, then re-entered (and checked against the
// server) on every login, on any device. Both calls rely on apiClient's
// interceptor to attach the session token, so they require an active login.

export async function setPin(pin: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<ApiEnvelope<{ success: boolean }>>('/api/auth/set-pin', {
    pin,
  });
  return data.data;
}

export async function verifyPin(pin: string): Promise<{ valid: boolean }> {
  const { data } = await apiClient.post<ApiEnvelope<{ valid: boolean }>>('/api/auth/verify-pin', {
    pin,
  });
  return data.data;
}

export async function changePin(currentPin: string, newPin: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<ApiEnvelope<{ success: boolean }>>('/api/auth/change-pin', {
    currentPin,
    newPin,
  });
  return data.data;
}

export interface SessionInfo {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  current: boolean;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const { data } = await apiClient.get<ApiEnvelope<SessionInfo[]>>('/api/auth/sessions');
  return data.data;
}

export async function revokeSession(id: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<ApiEnvelope<{ success: boolean }>>(`/api/auth/sessions/${id}`);
  return data.data;
}

/**
 * End **this** session on the server. `POST /api/auth/logout`, no request body.
 *
 * ## Why this exists, and why it is not optional
 *
 * `logout()` in `stores/userStore.ts` used to be entirely local: it wiped the
 * token from the device keystore and never told the server. Because
 * `requireAuth` treats the `Session` row as the source of truth, that row
 * survived and the discarded token kept authorising requests for the full
 * `JWT_EXPIRES_IN` — 7 days by default — after the user believed they had signed
 * out. Measured on the live server before the route existed: after a local-only
 * logout the same token still answered 200 on `/api/account/me`,
 * `/api/transaction` and `/api/contact`, and still created a payment request.
 * That is the window a lost or wiped phone leaves behind.
 *
 * Transfers were not reachable that way — the PIN gate is independent of the
 * session — but balances, contacts and payment requests were all readable and
 * creatable for a week from a token the user believed was dead.
 *
 * ## What it does and does not do
 *
 * Deletes by bearer token, never by user id, so it ends exactly one session and
 * cannot be aimed at another user's, and cannot sign the user out of every
 * device at once. Revoking *other* devices is `revokeSession` — and that route
 * now refuses the current session with "use POST /api/auth/logout to sign out",
 * so this is the only way to end the one you are holding.
 *
 * **Not** a substitute for `deleteAccount` (`DELETE /api/auth/me`), which
 * destroys the account.
 *
 * ## Shape of the response
 *
 * Idempotent at the service level, but end to end a second call is a **401**,
 * because `requireAuth` rejects the now-dead token before the handler runs. That
 * is the right answer for a logout — the user is signed out either way — but it
 * means "idempotent" must not be read as "200 every time". Callers should treat
 * a 401 as success here, which `stores/userStore.ts` does by never letting this
 * call's outcome block sign-out.
 */
export async function logout(): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<ApiEnvelope<{ success: boolean }>>('/api/auth/logout');
  return data.data;
}

// Permanent account deletion. The backend wipes the user, their wallets
// metadata and sessions; the caller is responsible for wiping local
// secure storage (mnemonics, session token, account id) afterwards.
export async function deleteAccount(): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<ApiEnvelope<{ success: boolean }>>('/api/auth/me');
  return data.data;
}
