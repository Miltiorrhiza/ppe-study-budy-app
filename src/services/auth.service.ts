import { MMKV } from 'react-native-mmkv';
import { supabase } from '../lib/supabase';
import type { User, Session } from '../types';

const authStorage = new MMKV({ id: 'auth-lockout' });

const LOCKOUT_FAILURES_KEY = 'login_failures';
const LOCKOUT_UNTIL_KEY = 'login_lockout_until';
const MAX_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export function validateEmail(email: string): boolean {
  const rfc5322 =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return rfc5322.test(email);
}

export function validatePassword(password: string): boolean {
  return password.length >= 8;
}

export interface RegisterFormParams {
  name: string;
  email: string;
  password: string;
  university?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateRegisterForm(params: RegisterFormParams): ValidationResult {
  const errors: Record<string, string> = {};

  if (!params.name || params.name.trim() === '') {
    errors.name = 'Name is required';
  }

  if (!params.email || params.email.trim() === '') {
    errors.email = 'Email is required';
  } else if (!validateEmail(params.email.trim())) {
    errors.email = 'Invalid email format';
  }

  if (!params.password || params.password.trim() === '') {
    errors.password = 'Password is required';
  } else if (!validatePassword(params.password)) {
    errors.password = 'Password must be at least 8 characters';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function getFailureCount(): number {
  return authStorage.getNumber(LOCKOUT_FAILURES_KEY) ?? 0;
}

function getLockoutUntil(): number {
  return authStorage.getNumber(LOCKOUT_UNTIL_KEY) ?? 0;
}

function incrementFailures(): void {
  const count = getFailureCount() + 1;
  authStorage.set(LOCKOUT_FAILURES_KEY, count);
  if (count >= MAX_FAILURES) {
    authStorage.set(LOCKOUT_UNTIL_KEY, Date.now() + LOCKOUT_DURATION_MS);
  }
}

function resetFailures(): void {
  authStorage.delete(LOCKOUT_FAILURES_KEY);
  authStorage.delete(LOCKOUT_UNTIL_KEY);
}

function isLockedOut(): boolean {
  const lockoutUntil = getLockoutUntil();
  if (lockoutUntil === 0) return false;
  if (Date.now() < lockoutUntil) return true;
  resetFailures();
  return false;
}

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

export async function register(params: {
  name: string;
  email: string;
  university: string;
  password: string;
}): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        name: params.name,
        university: params.university,
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error('Registration failed: no user data returned');

  return mapSupabaseUser(data.user);
}

export async function login(email: string, password: string): Promise<Session> {
  if (isLockedOut()) {
    const lockoutUntil = getLockoutUntil();
    const remainingMs = lockoutUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new Error(`Account locked. Try again in ${remainingMin} minutes.`);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    incrementFailures();
    if (isLockedOut()) {
      throw new Error('Too many failed attempts. Account locked for 15 minutes.');
    }
    throw error;
  }

  if (!data.session) throw new Error('Login failed: no session returned');

  resetFailures();
  return mapSupabaseSession(data.session);
}

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  return mapSupabaseSession(data.session);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}
