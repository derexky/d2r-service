import type { Request } from 'express';

const mockVerifyIdToken = jest.fn();
jest.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

import { getUid } from './firebase-auth';

const req = (authorization?: string) =>
  ({ headers: { authorization } }) as unknown as Request;

describe('getUid', () => {
  beforeEach(() => mockVerifyIdToken.mockReset());

  it('returns null without an Authorization header', async () => {
    expect(await getUid(req())).toBeNull();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('returns null for a non-Bearer header', async () => {
    expect(await getUid(req('Basic abc'))).toBeNull();
  });

  it('returns the uid of a valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1' });
    expect(await getUid(req('Bearer tok'))).toBe('u1');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok');
  });

  it('returns null when verification fails', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('expired'));
    expect(await getUid(req('Bearer tok'))).toBeNull();
  });
});
