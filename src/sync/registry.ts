import type { SupabaseClient } from '@supabase/supabase-js';

/** The app's Supabase client. Set once in _layout; null when the build has no Supabase env. Tests never set it. */
let client: SupabaseClient | null = null;

export function setSyncClient(c: SupabaseClient | null): void {
  client = c;
}

export function getSyncClient(): SupabaseClient | null {
  return client;
}

export function requireSyncClient(): SupabaseClient {
  if (!client) throw new Error("Sharing isn't set up in this build");
  return client;
}
