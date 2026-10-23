import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { generateKeyPairSync, sign } from 'crypto';
import { verifyAccessJwt } from './access-jwt';
import { AdminGuard } from './admin.guard';

const ctx = (headers: Record<string, string>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  const guard = new AdminGuard();
  const env = { ...process.env };

  beforeEach(() => {
    process.env = { ...env, ADMIN_TOKEN: 'secret' };
    delete process.env.FUNCTION_NAME;
    delete process.env.K_SERVICE;
    delete process.env.CF_ACCESS_TEAM_DOMAIN;
    delete process.env.CF_ACCESS_AUD;
  });
  afterAll(() => (process.env = env));

  it('accepts the matching token', async () => {
    await expect(guard.canActivate(ctx({ 'x-admin-token': 'secret' }))).resolves.toBe(true);
  });

  it('rejects missing or wrong token', async () => {
    await expect(guard.canActivate(ctx({}))).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx({ 'x-admin-token': 'nope' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects everything when ADMIN_TOKEN is unset', async () => {
    delete process.env.ADMIN_TOKEN;
    await expect(guard.canActivate(ctx({ 'x-admin-token': '' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('is disabled on Cloud Functions even with a valid token', async () => {
    process.env.K_SERVICE = 'api';
    await expect(guard.canActivate(ctx({ 'x-admin-token': 'secret' }))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ignores the token once Cloudflare Access is configured', async () => {
    process.env.CF_ACCESS_TEAM_DOMAIN = 'team.cloudflareaccess.com';
    process.env.CF_ACCESS_AUD = 'app';
    await expect(guard.canActivate(ctx({ 'x-admin-token': 'secret' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('verifyAccessJwt', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const iss = 'https://team.cloudflareaccess.com';
  const now = 1_800_000_000_000;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (payload: object, key = privateKey, header: object = { alg: 'RS256', kid: 'k1' }) => {
    const body = `${b64(header)}.${b64(payload)}`;
    return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
  };
  const keyOf = (kid: string) => (kid === 'k1' ? publicKey : undefined);
  const ok = { aud: ['app'], iss, exp: now / 1000 + 60 };

  it('accepts a token Access signed for this app', () => {
    expect(verifyAccessJwt(jwt(ok), keyOf, 'app', iss, now)).toBe(true);
  });

  it('rejects a forged, expired, foreign or malformed token', () => {
    expect(verifyAccessJwt(jwt(ok, other.privateKey), keyOf, 'app', iss, now)).toBe(false);
    expect(verifyAccessJwt(jwt({ ...ok, exp: now / 1000 - 1 }), keyOf, 'app', iss, now)).toBe(false);
    expect(verifyAccessJwt(jwt({ ...ok, aud: ['other-app'] }), keyOf, 'app', iss, now)).toBe(false);
    expect(verifyAccessJwt(jwt({ ...ok, iss: 'https://evil.cloudflareaccess.com' }), keyOf, 'app', iss, now)).toBe(false);
    expect(verifyAccessJwt(jwt(ok, privateKey, { alg: 'none', kid: 'k1' }), keyOf, 'app', iss, now)).toBe(false);
    expect(verifyAccessJwt(jwt(ok, privateKey, { alg: 'RS256', kid: 'k2' }), keyOf, 'app', iss, now)).toBe(false);
    expect(verifyAccessJwt('not.a.jwt', keyOf, 'app', iss, now)).toBe(false);
  });
});
