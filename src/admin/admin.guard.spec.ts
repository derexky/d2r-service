import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
  });
  afterAll(() => (process.env = env));

  it('accepts the matching token', () => {
    expect(guard.canActivate(ctx({ 'x-admin-token': 'secret' }))).toBe(true);
  });

  it('rejects missing or wrong token', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ 'x-admin-token': 'nope' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects everything when ADMIN_TOKEN is unset', () => {
    delete process.env.ADMIN_TOKEN;
    expect(() => guard.canActivate(ctx({ 'x-admin-token': '' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('is disabled on Cloud Functions even with a valid token', () => {
    process.env.K_SERVICE = 'api';
    expect(() => guard.canActivate(ctx({ 'x-admin-token': 'secret' }))).toThrow(
      NotFoundException,
    );
  });
});
