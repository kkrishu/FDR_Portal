import type { AxiosError, AxiosInstance } from 'axios';
import axios from 'axios';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './token-storage';

// Extend Axios config to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: { startTime: number };
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

function clearAuthStorage() {
  clearTokens();
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token and CSRF token
    this.client.interceptors.request.use(
      async (config) => {
        config.metadata = { startTime: Date.now() };

        // Add correlation ID
        config.headers['X-Correlation-ID'] =
          `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Add client version
        config.headers['X-Client-Version'] = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

        // Attach bearer token from the local auth store
        const token = getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Attach CSRF token from cookie for state-changing requests
        if (
          typeof window !== 'undefined' &&
          ['post', 'put', 'patch', 'delete'].includes(config.method || '')
        ) {
          const csrfToken = this.getCsrfTokenFromCookie();
          if (csrfToken) {
            config.headers['X-CSRF-Token'] = csrfToken;
          }
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors, refresh token
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config;

        // Endpoints where a 401 means "these credentials are wrong", not "your
        // session expired". Refreshing or redirecting here would swallow the real
        // error and bounce the user before they can read it.
        const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];
        const isCredentialCheck = AUTH_ENDPOINTS.some((path) =>
          originalRequest?.url?.includes(path)
        );

        // Handle 401 - try to refresh token
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !isCredentialCheck &&
          !originalRequest.headers['X-Retry']
        ) {
          originalRequest.headers['X-Retry'] = 'true';

          try {
            const refreshToken = getRefreshToken();
            if (!refreshToken) {
              throw new Error('No refresh token available');
            }

            // Try to refresh token
            const refreshResponse = await axios.post<any>(
              `${API_URL}/auth/refresh`,
              { refreshToken },
              { withCredentials: true }
            );

            const tokens = refreshResponse.data?.data;
            if (tokens?.accessToken) {
              setTokens({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken || refreshToken,
              });
              originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
              return this.client(originalRequest);
            }

            throw new Error('Token refresh failed');
          } catch (refreshError) {
            // Refresh failed: the session is genuinely over, so clear it and send
            // the user to sign in again.
            if (typeof window !== 'undefined') {
              clearAuthStorage();
              if (window.location.pathname !== '/login') {
                window.location.href = '/login';
              }
            }
            return Promise.reject(refreshError);
          }
        }

        // Transform error response
        const transformedError = this.transformError(error);
        return Promise.reject(transformedError);
      }
    );
  }

  private transformError(
    error: AxiosError
  ): Error & { response?: any; status?: number; code?: string } {
    const transformed = new Error(error.message) as Error & {
      response?: any;
      status?: number;
      code?: string;
    };
    transformed.response = error.response?.data;
    transformed.status = error.response?.status;
    transformed.code = (error.response?.data as any)?.error?.code;
    return transformed;
  }

  // HTTP methods
  async get<T = any>(url: string, params?: any): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  async post<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async put<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.client.patch<T>(url, data);
    return response.data;
  }

  async delete<T = any>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }

  // File upload
  async upload<T = any>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post<T>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data;
  }

  // Health check
  async health() {
    return this.get('/health');
  }

  /**
   * Get CSRF token from cookie
   */
  private getCsrfTokenFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrf-token') {
        return value;
      }
    }
    return null;
  }
}

export const api = new ApiClient();
export default api;
