'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole, AuthTokens } from '@fdr-portal/shared';
import { AUTH_STORE_KEY, clearTokens, setTokens as writeTokens } from './token-storage';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, tokens: AuthTokens) => void;
  setUser: (user: User | null) => void;
  setTokens: (tokens: AuthTokens) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (user, tokens) => {
        // Mirror tokens into the plain keys the API client reads. The store
        // blob below is React state; these keys are what authenticate requests.
        writeTokens({
          accessToken: tokens.accessToken || null,
          refreshToken: tokens.refreshToken || null,
        });
        set({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setTokens: (tokens) => {
        writeTokens({
          accessToken: tokens.accessToken || null,
          refreshToken: tokens.refreshToken || null,
        });
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      },

      logout: () => {
        clearTokens();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: AUTH_STORE_KEY,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // `isLoading` starts true so guards do not flash a redirect before the
      // persisted session is read back. Rehydration is the end of that wait.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Repair the plain token keys for sessions persisted before this fix,
        // so an already-signed-in user is not forced to log in again.
        if (state.accessToken) {
          writeTokens({
            accessToken: state.accessToken,
            refreshToken: state.refreshToken || null,
          });
        }
        state.setLoading(false);
      },
    }
  )
);

// Role-based access control helpers
export function hasRole(user: User | null, roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function canAccessRoute(user: User | null, allowedRoles: UserRole[]): boolean {
  return hasRole(user, allowedRoles);
}

export function getDashboardRoute(role: UserRole): string {
  const routes: Record<UserRole, string> = {
    INSTITUTION: '/dashboard/institution',
    OFFICER: '/dashboard/officer',
    ADMIN: '/dashboard/admin',
    BANK_MANAGER: '/dashboard/bank',
    NODAL_OFFICER: '/dashboard/bank/nodal',
    AUDITOR: '/dashboard/auditor',
  };
  return routes[role] || '/dashboard';
}
