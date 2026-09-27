import { formatJoinCode } from './joinCode';

/**
 * Invite links (spec §2.4). Two forms carry the same house id and invite secret:
 * - https: the secret sits in the fragment, which browsers never send to a server;
 * - chips://: the backup for chat apps that don't open https links in the app.
 *
 * Imported by `app/+native-intent.tsx`, which runs before the app mounts: keep this file free of
 * app imports and of `URL` (its behaviour differs across engines and for custom schemes).
 */

const WEB_HOST = 'stevenkhaw.github.io';
const WEB_JOIN_PATH = '/Chips/join';
export const INVITE_WEB_BASE = `https://${WEB_HOST}${WEB_JOIN_PATH}/`;
export const APP_SCHEME = 'chips';

export interface Invite {
  houseId: string;
  secret: string;
}

/** null: not a join URL at all (let the router have it). bad: a join URL with missing or malformed h/s. */
export type ParsedInvite = { kind: 'invite'; invite: Invite } | { kind: 'bad' } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 32 random bytes, url-safe base64 without padding (supabase `private.new_invite_secret`). */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export const buildWebLink = (i: Invite) => `${INVITE_WEB_BASE}#h=${i.houseId}&s=${i.secret}`;
export const buildAppLink = (i: Invite) => `${APP_SCHEME}://join?h=${i.houseId}&s=${i.secret}`;

export function parseInviteUrl(url: string): ParsedInvite {
  const hashAt = url.indexOf('#');
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : '';
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = beforeHash.indexOf('?');
  const query = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : '';
  const base = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;

  const m = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(base);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const rest = m[2];

  if (scheme === 'https' && rest.startsWith('//')) {
    const slash = rest.indexOf('/', 2);
    const host = (slash >= 0 ? rest.slice(2, slash) : rest.slice(2)).toLowerCase();
    const path = slash >= 0 ? rest.slice(slash) : '';
    if (host !== WEB_HOST || (path !== WEB_JOIN_PATH && path !== `${WEB_JOIN_PATH}/`)) return null;
    return fromParams(fragment);
  }
  if (scheme === APP_SCHEME && rest.replace(/^\/+/, '').replace(/\/$/, '') === 'join') return fromParams(query);
  if (/\/--\/join\/?$/.test(rest)) return fromParams(query); // Expo Go: exp://host:port/--/join
  return null;
}

function fromParams(raw: string): ParsedInvite {
  const params = new Map<string, string>();
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    if (params.has(key)) return { kind: 'bad' };
    params.set(key, eq >= 0 ? pair.slice(eq + 1) : '');
  }
  const h = params.get('h') ?? '';
  const s = params.get('s') ?? '';
  if (!UUID.test(h) || !SECRET.test(s)) return { kind: 'bad' };
  return { kind: 'invite', invite: { houseId: h.toLowerCase(), secret: s } };
}

/** The message behind Share invite / Copy invite text (spec §2.5). */
export function buildInviteText(a: {
  houseName: string;
  joinCode: string | null;
  password: string | null;
  invite: Invite | null;
}): string {
  const lines = [`Join my Chips house "${a.houseName}"`];
  if (a.invite) lines.push(`Tap: ${buildWebLink(a.invite)}`, `Or: ${buildAppLink(a.invite)}`);
  if (a.joinCode) {
    lines.push(a.invite ? 'Or in the app → Join house:' : 'In the app → Join house:', `  Code: ${formatJoinCode(a.joinCode)}`);
    if (a.password) lines.push(`  Password: ${a.password}`);
  }
  return lines.join('\n');
}
