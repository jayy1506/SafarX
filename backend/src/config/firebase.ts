import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { ENV } from './env.js';
import fs from 'fs';

let firebaseApp: App | null = null;

export function initializeFirebase(): App | null {
  if (firebaseApp) return firebaseApp;

  try {
    const rawAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    const projectId = process.env.FIREBASE_PROJECT_ID || 'safarx-513ce';

    let credentials: any = null;

    if (rawAccount) {
      if (rawAccount.startsWith('{')) {
        credentials = JSON.parse(rawAccount);
      } else if (fs.existsSync(rawAccount)) {
        credentials = JSON.parse(fs.readFileSync(rawAccount, 'utf8'));
      }
    }

    if (credentials) {
      // Fix multiline private key if escaped
      if (credentials.private_key && typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      firebaseApp = initializeApp({
        credential: cert(credentials),
        projectId: credentials.project_id || projectId,
      });
      console.log('[Firebase Admin] Initialized successfully with Service Account credentials.');
    } else {
      firebaseApp = initializeApp({
        projectId,
      });
      console.log(`[Firebase Admin] Initialized with Project ID: ${projectId}`);
    }

    return firebaseApp;
  } catch (error: any) {
    console.warn('[Firebase Init Warning]', error.message);
    return null;
  }
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string; phone_number?: string; name?: string } | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  try {
    const app = initializeFirebase();
    if (app) {
      const decoded = await getAuth(app).verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: decoded.email,
        phone_number: decoded.phone_number,
        name: decoded.name || decoded.email?.split('@')[0],
      };
    }
  } catch (err: any) {
    if (ENV.IS_PRODUCTION) {
      console.warn('[Firebase Verification Failed in Production]', err.message);
      return null;
    }
  }

  // In production, reject any non-verified tokens immediately
  if (ENV.IS_PRODUCTION) {
    return null;
  }

  // Development & Test Mode Support: only parse formatted test tokens
  const isTestToken =
    idToken.startsWith('test_firebase_') ||
    idToken.startsWith('mock_fb_') ||
    idToken.startsWith('test_phone_') ||
    idToken.startsWith('test_google_');

  if (isTestToken) {
    try {
      const parts = idToken.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const phone = payload.phone_number || payload.phone;
        return {
          uid: payload.user_id || payload.sub || `fb_test_${Date.now()}`,
          email: payload.email,
          phone_number: phone,
          name: payload.name || payload.displayName || 'SafarX Test User',
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}
