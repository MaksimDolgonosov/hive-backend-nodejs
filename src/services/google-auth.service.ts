import { OAuth2Client } from 'google-auth-library';

import env from '../config/env';
import { AppError } from '../utils/AppError';

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

let oauthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (!oauthClient) {
    oauthClient = new OAuth2Client();
  }
  return oauthClient;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  if (!env.googleClientIds.length) {
    throw new AppError(
      503,
      'GOOGLE_AUTH_NOT_CONFIGURED',
      'Google Sign-In не настроен на сервере',
    );
  }

  try {
    const ticket = await getOAuthClient().verifyIdToken({
      idToken,
      audience: env.googleClientIds,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Не удалось проверить Google token');
    }

    if (!payload.email_verified) {
      throw new AppError(401, 'GOOGLE_EMAIL_NOT_VERIFIED', 'Email Google не подтверждён');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: true,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('[google-auth] Token verification failed:', error);
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Не удалось проверить Google token');
  }
}
