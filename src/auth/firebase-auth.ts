import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'express';

// Verifying ID tokens only needs the project id, so this also works locally without credentials
const app =
  getApps()[0] ??
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'd2r-diablo' });

// The signed-in user's uid, or null when the request has no valid Firebase ID token
export async function getUid(req: Request): Promise<string | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return null;
  try {
    return (await getAuth(app).verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}
