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
    const axiosErr = err as AxiosError<{ code?: string; message?: string }>;
    return {
      status: axiosErr.response?.status ?? null,
      code: axiosErr.response?.data?.code ?? 'network_error',
      message: axiosErr.response?.data?.message ?? axiosErr.message ?? 'Something went wrong',
    };
  }
  return { status: null, code: 'unknown_error', message: 'Something went wrong' };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiError(error))
);
