import axios, { AxiosError, AxiosInstance } from 'axios';
import { getSecureItem, SecureStorageKeys } from '../storage/secureStorage';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getSecureItem(SecureStorageKeys.SESSION_TOKEN);
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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiError(error))
);
