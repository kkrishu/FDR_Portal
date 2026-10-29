'use client';

/**
 * Data access hooks.
 *
 * Thin wrappers over SWR that talk to the axios client. The client already
 * unwraps the API envelope, so a successful response is `{ success, data, meta }`
 * and a failure is an Error carrying `response: { error: { code, message } }`.
 * Everything below assumes that shape — reading `error.response.data` (as two
 * pages previously did) is the bug that made errors look empty.
 */

import useSWR, { type SWRConfiguration, type Key } from 'swr';
import useSWRMutation from 'swr/mutation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    requestId: string;
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    unreadCount?: number;
    [key: string]: unknown;
  };
}

export interface ApiError extends Error {
  response?: {
    success: false;
    error: { code: string; message: string; details?: any };
    meta?: Record<string, unknown>;
  };
  status?: number;
  code?: string;
}

/** The message a person should see for any failure, including network errors. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const apiError = error as ApiError | undefined;
  const message = apiError?.response?.error?.message;
  if (typeof message === 'string' && message) return message;
  if (apiError?.message === 'Network Error') {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return apiError?.message || fallback;
}

/** Per-field validation errors, keyed by field path. */
export function getFieldErrors(error: unknown): Record<string, string> {
  const entries = (error as ApiError | undefined)?.response?.error?.details?.errors;
  if (!Array.isArray(entries)) return {};
  return entries.reduce<Record<string, string>>((acc, entry) => {
    if (entry?.field) acc[entry.field] = entry.message;
    return acc;
  }, {});
}

/** Turn a query object into a stable SWR key, dropping empty values. */
export function toQueryKey(
  path: string,
  params?: Record<string, unknown>
): [string, Record<string, unknown>] | string {
  if (!params) return path;
  const cleaned = Object.entries(params).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value === undefined || value === null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
  return Object.keys(cleaned).length > 0 ? [path, cleaned] : path;
}

const fetcher = async <T>(key: Key): Promise<ApiEnvelope<T>> => {
  const [path, params] = Array.isArray(key) ? key : [key, undefined];
  return api.get<ApiEnvelope<T>>(path as string, params);
};

/**
 * Read data. Returns the envelope so callers can use `meta` for pagination.
 *
 * `keepPreviousData` is on by default: page changes should not blank the table.
 */
export function useApi<T = any>(
  key: Key | null,
  config?: SWRConfiguration<ApiEnvelope<T>, ApiError>
) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApiEnvelope<T>, ApiError>(
    key,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      ...config,
    }
  );

  return {
    data: data?.data,
    meta: data?.meta,
    error,
    errorMessage: error ? getErrorMessage(error) : null,
    isLoading,
    isValidating,
    refresh: mutate,
  };
}

/** Read a single record by path, e.g. `useApiItem<FDR>(`/fdrs/${id}`)`. */
export function useApiItem<T = any>(
  path: string | null,
  config?: SWRConfiguration<ApiEnvelope<T>, ApiError>
) {
  return useApi<T>(path, config);
}

export interface MutationOptions {
  /** Show a success toast. Pass a string to control the wording. */
  successMessage?: string | false;
  /** Show an error toast on failure. Defaults to true. */
  errorMessage?: string | false;
  /** Keys to revalidate after success. */
  revalidate?: string[] | ((result: any) => string[]);
  onSuccess?: (result: any) => void | Promise<void>;
  onError?: (error: ApiError) => void;
}

function resolveRevalidate(option: MutationOptions['revalidate'], result: any): string[] {
  if (!option) return [];
  return typeof option === 'function' ? option(result) : option;
}

/**
 * POST / PUT / PATCH / DELETE against a fixed path.
 * Toasts and revalidation are opt-in but on by default for errors, because a
 * silent failure is worse than a noisy one.
 */
export function useApiMutation<TResult = any, TInput = any>(
  path: string,
  method: 'post' | 'put' | 'patch' | 'delete' = 'post',
  options: MutationOptions = {}
) {
  const { trigger, isMutating, error, reset } = useSWRMutation<
    ApiEnvelope<TResult>,
    ApiError,
    string,
    TInput
  >(path, async (url, { arg }) => {
    if (method === 'delete') return api.delete<ApiEnvelope<TResult>>(url);
    if (method === 'put') return api.put<ApiEnvelope<TResult>>(url, arg);
    if (method === 'patch') return api.patch<ApiEnvelope<TResult>>(url, arg);
    return api.post<ApiEnvelope<TResult>>(url, arg);
  });

  const triggerWithArgs = trigger as unknown as (arg?: TInput) => Promise<ApiEnvelope<TResult>>;

  const run = useCallback(
    async (input?: TInput) => {
      try {
        const result = await triggerWithArgs(input);

        if (options.successMessage !== false) {
          toast.success(options.successMessage || 'Saved');
        }

        const keys = resolveRevalidate(options.revalidate, result?.data);
        const { mutate } = await import('swr');
        await Promise.all(keys.map((key) => mutate(key)));

        await options.onSuccess?.(result?.data);
        return result?.data;
      } catch (caught) {
        const apiError = caught as ApiError;
        if (options.errorMessage !== false) {
          toast.error(options.errorMessage || getErrorMessage(apiError, 'Could not save changes'));
        }
        options.onError?.(apiError);
        throw apiError;
      }
    },
    [triggerWithArgs, options]
  );

  return { run, isMutating, error, errorMessage: error ? getErrorMessage(error) : null, reset };
}

/**
 * Mutation against a path built from the argument — for row-level actions like
 * `PATCH /notifications/:id/read` where the id is only known at click time.
 */
export function useDynamicMutation<TResult = any, TInput = any>(
  method: 'post' | 'put' | 'patch' | 'delete',
  options: MutationOptions = {}
) {
  const { trigger, isMutating } = useSWRMutation<
    ApiEnvelope<TResult>,
    ApiError,
    string,
    { path: string; body?: TInput }
  >('dynamic', async (_key, { arg }) => {
    if (method === 'delete') return api.delete<ApiEnvelope<TResult>>(arg.path);
    if (method === 'put') return api.put<ApiEnvelope<TResult>>(arg.path, arg.body);
    if (method === 'patch') return api.patch<ApiEnvelope<TResult>>(arg.path, arg.body);
    return api.post<ApiEnvelope<TResult>>(arg.path, arg.body);
  });

  const run = useCallback(
    async (path: string, body?: TInput) => {
      try {
        const result = await trigger({ path, body });
        if (options.successMessage) toast.success(options.successMessage);
        const keys = resolveRevalidate(options.revalidate, result?.data);
        const { mutate } = await import('swr');
        await Promise.all(keys.map((key) => mutate(key)));
        await options.onSuccess?.(result?.data);
        return result?.data;
      } catch (caught) {
        const apiError = caught as ApiError;
        if (options.errorMessage !== false) {
          toast.error(options.errorMessage || getErrorMessage(apiError));
        }
        options.onError?.(apiError);
        throw apiError;
      }
    },
    [trigger, options]
  );

  return { run, isMutating };
}
