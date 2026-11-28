export interface AuthEnv {
  SUPABASE_URL?: string;
  SUPABASE_JWT_ISSUER?: string;
}

export type AuthIdentity = { subject: string; issuer: string; expiresAt: number };
type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtClaims = { sub?: string; iss?: string; aud?: string | string[]; exp?: number; nbf?: number };

const decodeBase64Url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const decodeJson = <T>(value: string): T =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;

const jwksCache = new Map<string, { expiresAt: number; keys: JsonWebKey[] }>();

async function getJwks(issuer: string): Promise<JsonWebKey[]> {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(issuer.replace(/\/$/, '') + '/.well-known/jwks.json', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('jwks_unavailable');
  const payload = await response.json() as { keys?: JsonWebKey[] };
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) throw new Error('jwks_empty');
  jwksCache.set(issuer, { keys: payload.keys, expiresAt: Date.now() + 5 * 60_000 });
  return payload.keys;
}

export async function verifySupabaseBearer(request: Request, env: AuthEnv): Promise<AuthIdentity | null> {
  const configuredIssuer = env.SUPABASE_JWT_ISSUER?.trim().replace(/\/$/, '');
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!configuredIssuer || !supabaseUrl || configuredIssuer !== supabaseUrl + '/auth/v1') return null;

  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if (!match) return null;
  const parts = match[1].split('.');
  if (parts.length !== 3) return null;

  try {
    const header = decodeJson<JwtHeader>(parts[0]);
    const claims = decodeJson<JwtClaims>(parts[1]);
    if (!header.kid || !['ES256', 'RS256'].includes(header.alg ?? '')) return null;
    if (claims.iss !== configuredIssuer || typeof claims.sub !== 'string' || !claims.sub) return null;
    if (!(claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.includes('authenticated')))) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
    if (typeof claims.nbf === 'number' && claims.nbf > now + 30) return null;

    const jwks = await getJwks(configuredIssuer);
    const jwk = jwks.find(key => (key as JsonWebKey & { kid?: string }).kid === header.kid);
    if (!jwk) return null;
    const algorithm: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams = header.alg === 'ES256'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const verifyAlgorithm: AlgorithmIdentifier | EcdsaParams = header.alg === 'ES256'
      ? { name: 'ECDSA', hash: 'SHA-256' }
      : { name: 'RSASSA-PKCS1-v1_5' };
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    const signature = Uint8Array.from(decodeBase64Url(parts[2])).buffer;
    const signedData = new TextEncoder().encode(parts[0] + '.' + parts[1]).buffer;
    const valid = await crypto.subtle.verify(verifyAlgorithm, key, signature, signedData);
    return valid ? { subject: claims.sub, issuer: configuredIssuer, expiresAt: claims.exp } : null;
  } catch {
    return null;
  }
}
