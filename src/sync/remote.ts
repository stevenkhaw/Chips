import type { SupabaseClient } from '@supabase/supabase-js';

/** Signs in anonymously the first time; returns the auth user id. */
export async function ensureSession(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await client.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error('Sign-in failed');
  return signed.user.id;
}
