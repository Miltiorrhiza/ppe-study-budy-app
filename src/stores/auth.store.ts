import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { logout } from '../services/auth.service';
import type { Session, User } from '../types';

// ---- Types ----

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

// ---- Helpers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSupabaseUser(supabaseUser: any): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    name: (supabaseUser.user_metadata?.name as string) ?? '',
    university: (supabaseUser.user_metadata?.university as string) ?? null,
    createdAt: new Date(supabaseUser.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSupabaseSession(supabaseSession: any): Session {
  return {
    accessToken: supabaseSession.access_token,
    refreshToken: supabaseSession.refresh_token,
    expiresAt: supabaseSession.expires_at ?? 0,
    user: mapSupabaseUser(supabaseSession.user),
  };
}

// ---- Store ----

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  // Initial state
  session: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  // Actions
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: session !== null,
    }),

  setUser: (user) => set({ user }),

  setLoading: (loading) => set({ isLoading: loading }),

  signOut: async () => {
    await logout();
    set({ session: null, user: null, isAuthenticated: false });
  },

  /**
   * Called once on app startup.
   * Reads the current Supabase session (persisted via MMKV adapter in supabase.ts)
   * and sets up an auth state change listener to keep the store in sync.
   */
  initialize: async () => {
    set({ isLoading: true });

    try {
      // Read the persisted session from Supabase (backed by MMKV)
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.warn('[AuthStore] getSession error:', error.message);
        set({ session: null, user: null, isAuthenticated: false });
      } else if (data.session) {
        const session = mapSupabaseSession(data.session);
        set({ session, user: session.user, isAuthenticated: true });
      } else {
        set({ session: null, user: null, isAuthenticated: false });
      }
    } finally {
      set({ isLoading: false });
    }

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    supabase.auth.onAuthStateChange((_event, supabaseSession) => {
      if (supabaseSession) {
        const session = mapSupabaseSession(supabaseSession);
        set({ session, user: session.user, isAuthenticated: true });
      } else {
        set({ session: null, user: null, isAuthenticated: false });
      }
    });
  },
}));
