import { User } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { mapDbProfileToUser } from '@/lib/mappers';
import { DbProfile } from '@/types/database.types';

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

/**
 * Register a new user with Supabase Auth.
 * Supabase auth.users creation automatically triggers handle_new_user()
 * which populates the public.profiles table.
 */
export async function registerUser(
  name: string,
  email: string,
  phone: string,
  password: string
): Promise<AuthResult> {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedPhone = phone.trim();

  if (!trimmedName || !trimmedEmail || !trimmedPhone || !password) {
    return { success: false, error: 'All fields are required.' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  const supabase = createClient();

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: {
        full_name: trimmedName,
        phone_number: trimmedPhone,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: 'Registration failed. Please try again.' };
  }

  // Fetch the created profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  const user: User = profile
    ? mapDbProfileToUser(profile as DbProfile)
    : {
        id: data.user.id,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        role: 'User',
        createdAt: data.user.created_at,
      };

  return { success: true, user };
}

/**
 * Login user with email + password via Supabase Auth.
 */
export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    return { success: false, error: 'Please enter both email and password.' };
  }

  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: 'Login failed. Please try again.' };
  }

  // Fetch full profile from public.profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  const user: User = profile
    ? mapDbProfileToUser(profile as DbProfile)
    : {
        id: data.user.id,
        name: data.user.user_metadata?.full_name || data.user.email || 'User',
        email: data.user.email || '',
        phone: data.user.user_metadata?.phone_number || '',
        role: 'User',
        createdAt: data.user.created_at,
      };

  return { success: true, user };
}

/**
 * Get current authenticated user session & profile.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (!profile) {
    return {
      id: authData.user.id,
      name: authData.user.user_metadata?.full_name || authData.user.email || 'User',
      email: authData.user.email || '',
      phone: authData.user.user_metadata?.phone_number || '',
      role: 'User',
      createdAt: authData.user.created_at,
    };
  }

  return mapDbProfileToUser(profile as DbProfile);
}

/**
 * Logout current user from Supabase Auth.
 */
export async function logoutUser(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

/**
 * Update current user profile fields in public.profiles.
 * Authenticated session user ID is retrieved directly from Supabase Auth.
 */
export async function updateUserProfile(
  updates: { name?: string; phone?: string }
): Promise<boolean> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return false;

  const payload: Partial<DbProfile> = {};
  if (updates.name !== undefined) payload.full_name = updates.name;
  if (updates.phone !== undefined) payload.phone_number = updates.phone;

  const { error } = await (supabase.from('profiles') as any)
    .update(payload)
    .eq('id', authData.user.id);

  return !error;
}
