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
// keep sending a stale token for the rest of the process.
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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // A rejected session must not keep being replayed from the cache for the
    // rest of the process.
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearCachedSessionToken();
    }
    return Promise.reject(toApiError(error));
  }
);
