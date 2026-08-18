import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUserDTO, LoginResponseDTO } from '@pos/shared';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUserDTO | null;
  /** True once the persisted session has been read from storage — gates redirects
   * so a page refresh doesn't bounce an authenticated user to /login. */
  hydrated: boolean;
  setSession: (res: LoginResponseDTO) => void;
  clear: () => void;
  setHydrated: () => void;
}

/**
 * Auth session store. Persisted to localStorage so a refresh keeps the user
 * logged in; the api-client reads/writes it outside React via `getState()` to
 * attach the bearer token and rotate it on refresh.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setSession: (res) =>
        set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'pos-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
