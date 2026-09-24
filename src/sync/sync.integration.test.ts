/**
 * @jest-environment node
 *
 * Owner and reader phones against the local Supabase stack. Skipped unless CHIPS_SUPABASE_URL/KEY are set;
 * run with `npm run test:sync` after `supabase start`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureSession } from './remote';

const URL = process.env.CHIPS_SUPABASE_URL;
const KEY = process.env.CHIPS_SUPABASE_KEY;
const describeIt = URL && KEY ? describe : describe.skip;

export function newClient(): SupabaseClient {
  return createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

describeIt('sync against local Supabase', () => {
  jest.setTimeout(30000);

  it('signs in anonymously and keeps the same user', async () => {
    const c = newClient();
    const a = await ensureSession(c);
    const b = await ensureSession(c);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });
});
