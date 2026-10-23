import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'crypto';

// Cloudflare Access 在放行的請求上帶 Cf-Access-Jwt-Assertion（RS256），公鑰在 <team>/cdn-cgi/access/certs
export function verifyAccessJwt(
  token: string,
  keyOf: (kid: string) => KeyObject | undefined,
  aud: string,
  iss: string,
  now = Date.now(),
): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const key = header.alg === 'RS256' ? keyOf(header.kid) : undefined;
    if (!key) return false;
    const signed = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
    const auds: unknown[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    return signed && auds.includes(aud) && payload.iss === iss && typeof payload.exp === 'number' && payload.exp * 1000 > now;
  } catch {
    return false;
  }
}

let cache: { team: string; at: number; keys: Map<string, KeyObject> } | undefined;

// Access 會輪換金鑰：快取一小時，遇到沒看過的 kid 立刻重抓
export async function accessKeys(team: string, kid: string): Promise<Map<string, KeyObject>> {
  if (cache?.team === team && cache.keys.has(kid) && Date.now() - cache.at < 3_600_000) return cache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs ${res.status}`);
  const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  cache = { team, at: Date.now(), keys: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])) };
  return cache.keys;
}
