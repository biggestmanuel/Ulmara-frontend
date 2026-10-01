import axios, { AxiosError, AxiosInstance } from 'axios';
import { getSecureItem, SecureStorageKeys } from '../storage/secureStorage';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// --- Session token cache -----------------------------------------------------
//
// The request interceptor used to await a SecureStore read on *every* request.
// expo-secure-store is a native bridge call that also does keychain/keystore
// I/O, so a screen issuing four parallel requests paid four serialised bridge
// round-trips before any of them could leave the device. That is pure JS-thread
// latency in front of every fetch.
//
// The token is cached in memory for the lifetime of the JS context and
// invalidated explicitly, which is safe: a cold start has an empty cache and
// reads from SecureStore once, and the two places that change the token (login,
// logout) both clear it.
//
// A 401 response also clears the cache, so a session revoked server-side cannot
// keep sending a stale token for the rest of the process - but only for the 401s
// that actually mean the session is gone. See `isSessionRejection` below.
let cachedToken: string | null = null;
let tokenLoaded = false;

export function setCachedSessionToken(token: string | null): void {
  cachedToken = token;
  tokenLoaded = token !== null;
}

export function clearCachedSessionToken(): void {
  cachedToken = null;
  tokenLoaded = false;
}

async function resolveSessionToken(): Promise<string | null> {
  if (tokenLoaded) return cachedToken;
  cachedToken = await getSecureItem(SecureStorageKeys.SESSION_TOKEN);
  tokenLoaded = true;
  return cachedToken;
}

apiClient.interceptors.request.use(async (config) => {
  const token = await resolveSessionToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorShape {
  status: number | null;
  code: string;
  message: string;
}

// Human-readable fallbacks per status — the backend now sends readable
// messages, but network failures/timeouts have no server message at all,
// and these keep every screen's error text user-facing.
const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your details and try again.',
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to do that.",
  404: 'Not found. Please check the details and try again.',
  408: 'The request timed out. Please try again.',
  409: 'That conflicts with an existing account. Try logging in instead.',
  423: 'Too many incorrect PIN attempts. Please wait and try again later.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
  502: 'Our servers are temporarily unreachable. Please try again shortly.',
  503: 'Service temporarily unavailable. Please try again shortly.',
  504: 'The request timed out. Please try again.',
};

export function toApiError(err: unknown): ApiErrorShape {
  /**
   * The axios check MUST come before the duck-typed check below.
   *
   * A thrown `AxiosError` carries `status`, `code` (`ERR_BAD_REQUEST`) and
   * `message` (`"Request failed with status code 400"`), so it satisfies a
   * duck-typed `{ status, code, message }` test. With that branch first, every
   * axios rejection was captured there and returned its own transport echo as
   * the message — so the envelope extraction below never ran for any real
   * request. Verified against the live backend: entering your own Account ID
   * returns `400 { success:false, message:"Cannot resolve your own Account ID
   * for transfer" }`, and the Send screen displayed "Invalid request. Please
   * check your details and try again." instead. `isUserFacingMessage` then
   * correctly rejected the axios echo and `friendlyError` fell through to the
   * per-status copy, which hid the reason on every screen in the app.
   *
   * `isAxiosError` is the more specific test, so it has to be asked first.
   */
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ success?: boolean; message?: string }>;
    const status = axiosErr.response?.status ?? null;
    // Only trust { success: false, message } envelopes — non-envelopes could
    // be proxy/HTML error pages whose bodies aren't meant for the UI.
    const envelope = axiosErr.response?.data;
    const serverMessage =
      envelope && envelope.success === false && typeof envelope.message === 'string'
        ? envelope.message
        : null;
    const isNetworkFailure = !axiosErr.response;
    return {
      status,
      code: isNetworkFailure ? 'network_error' : `http_${status ?? 0}`,
      message:
        serverMessage ??
        (isNetworkFailure
          ? 'Cannot reach the server. Check your internet connection and try again.'
          : FALLBACK_MESSAGES[status as number] ??
            axiosErr.message ??
            'Something went wrong. Please try again.'),
    };
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    'code' in err &&
    'message' in err
  ) {
    const apiError = err as Partial<ApiErrorShape>;
    return {
      status: typeof apiError.status === 'number' ? apiError.status : null,
      code: typeof apiError.code === 'string' ? apiError.code : 'unknown_error',
      message: typeof apiError.message === 'string' ? apiError.message : 'Something went wrong',
    };
  }
  return { status: null, code: 'unknown_error', message: 'Something went wrong. Please try again.' };
}

// A server message is only user-facing when it is actually prose. Fastify
// `handleError` and `errorResponse` always send readable text, but an
// unhandled shape (a bare status line, a JSON string, a stack-shaped message)
// can still reach the UI. Anything that looks like raw transport noise falls
// back to the per-status copy above so no screen ever renders "409" or
// "Request failed with status code 500".
const NON_PROSE = /^[\s\d\W]*$/; // digits/punctuation only, e.g. "500", "500 Internal Server Error"
const HTTP_ECHO = /^(HTTP\s*)?\d{3}\b/i; // "HTTP 500", "500 Internal Server Error"
const AXIOS_ECHO = /^Request failed with status code \d+/i;
const HTML_BODY = /^\s*<(!doctype|html)/i;

function isUserFacingMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 300) return false;
  if (NON_PROSE.test(trimmed)) return false;
  if (HTTP_ECHO.test(trimmed) || AXIOS_ECHO.test(trimmed) || HTML_BODY.test(trimmed)) return false;
  return true;
}

/**
 * Single entry point for turning any thrown value into copy a user can act on.
 *
 * Screens used to read `(err as ApiErrorShape).message` directly, which silently
 * produced `undefined` (rendering nothing at all) for any rejection that had
 * not already been normalised by the response interceptor. Routing every screen
 * through this guarantees a message always exists and is never a bare status code.
 *
 * Precedence:
 *  1. A readable message that came from the server (any HTTP status) or from a
 *     real transport failure.
 *  2. Per-status fallback copy.
 *  3. The caller's own `fallback`.
 *
 * Step 3 is only reached when the rejection carried no information at all — a
 * bare `Error`, a thrown string, `undefined`. Without the `carriesInformation`
 * guard the generic "Something went wrong. Please try again." produced by
 * `toApiError` would always pass the prose check above, which would make every
 * screen's tailored fallback unreachable dead code.
 */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const apiError = toApiError(err);
  const carriesInformation = apiError.status !== null || apiError.code === 'network_error';
  if (carriesInformation && isUserFacingMessage(apiError.message)) return apiError.message;
  if (apiError.status !== null) return FALLBACK_MESSAGES[apiError.status] ?? fallback;
  return fallback;
}

/**
 * Whether a 401 means "this session is no longer valid".
 *
 * The backend uses 401 for two unrelated situations:
 *
 *  - the token is missing, expired or revoked (`requireAuth` answers
 *    "Unauthorized", "Session expired" or "Invalid token");
 *  - the PIN is wrong. `pinLockout.assertPinAuthorized` throws 401
 *    "Incorrect PIN. Try again." for a bad guess, and 423 while an account is
 *    locked out - both behind a `requireAuth` that already accepted the session.
 *
 * Treating them alike was a real defect. Every wrong keystroke on the unlock
 * screen cleared the cached token, so the next request had to re-read it from
 * SecureStore - a native keychain call on the request path - and the user was
 * one bad guess away from the cache being defeated. The same function is the
 * signal the auth gate and root layout read as "this session is no longer
 * good", so a wrong PIN was indistinguishable from a revoked session at exactly
 * the layer that decides what happens next.
 *
 * The lockout service's messages are matched rather than the endpoints it
 * guards, because the endpoint list is not ours to keep in sync: PIN
 * authorization reaches transfers, external transfers and PIN changes as well as
 * the unlock screen, and a new one would otherwise silently regress this.
 * `INCORRECT_MESSAGE` and `LOCKED_MESSAGE` are module constants in
 * `pinLockout.service.ts`; matching on them means the check fails *open* - an
 * unrecognised 401 body is treated as a session rejection, which is the
 * behaviour that existed before.
 *
 * A 423 is deliberately not consulted: it is only ever a lockout, and it never
 * implied an invalid session, so the countdown behaviour is untouched.
 */
function isSessionRejection(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.response?.status !== 401) return false;

  const data = error.response.data as { message?: unknown } | undefined;
  const message = typeof data?.message === 'string' ? data.message : '';
  if (message.startsWith('Incorrect PIN')) return false;
  if (message.startsWith('Too many incorrect PIN attempts')) return false;
  return true;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // A rejected session must not keep being replayed from the cache for the
    // rest of the process. A wrong PIN must not: it says nothing about the
    // session, which `requireAuth` had already accepted.
    if (isSessionRejection(error)) {
      clearCachedSessionToken();
    }
    return Promise.reject(toApiError(error));
  }
);
