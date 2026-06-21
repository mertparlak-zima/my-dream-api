import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { expo } from '@better-auth/expo';

import { db } from '../db';
import * as schema from '../db/schema';
import {
  APPLE_APP_BUNDLE_IDENTIFIER,
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY,
  APPLE_SERVICE_ID,
  APPLE_TEAM_ID,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_WEB_CLIENT_SECRET,
  IS_PRODUCTION,
} from '../config';
import { generateAppleClientSecret } from './apple-client-secret';

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30-day rolling inactivity window
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24; // refresh at most once per day
const SESSION_FRESH_AGE_SECONDS = 60 * 10; // 10-minute freshness gate (e.g. DELETE /me)

// Mobile dev origins are only trusted outside production; prod keeps the real
// app scheme plus Apple's host (required for the Sign in with Apple flow).
const trustedOrigins = [
  'myapp://',
  'https://appleid.apple.com',
  ...(IS_PRODUCTION ? [] : ['myapp-dev://', 'exp://**']),
];

// Each provider is registered only when its full credential set is present, so
// local development can boot without Apple/Google secrets configured.
const hasGoogleConfig = Boolean(
  GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID && GOOGLE_ANDROID_CLIENT_ID && GOOGLE_WEB_CLIENT_SECRET,
);
const hasAppleConfig = Boolean(
  APPLE_SERVICE_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY && APPLE_APP_BUNDLE_IDENTIFIER,
);

const socialProviders = {
  ...(hasGoogleConfig
    ? {
        google: {
          clientId: [GOOGLE_WEB_CLIENT_ID!, GOOGLE_IOS_CLIENT_ID!, GOOGLE_ANDROID_CLIENT_ID!],
          clientSecret: GOOGLE_WEB_CLIENT_SECRET!,
        },
      }
    : {}),
  ...(hasAppleConfig
    ? {
        apple: async (): Promise<{ clientId: string; clientSecret: string; appBundleIdentifier: string }> => ({
          clientId: APPLE_SERVICE_ID!,
          clientSecret: await generateAppleClientSecret(
            APPLE_SERVICE_ID!,
            APPLE_TEAM_ID!,
            APPLE_KEY_ID!,
            APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
          ),
          appBundleIdentifier: APPLE_APP_BUNDLE_IDENTIFIER!,
        }),
      }
    : {}),
};

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  advanced: { database: { generateId: 'uuid' } },
  // No secondaryStorage: sessions/verifications stay in PostgreSQL as the single
  // source of truth. Redis is reserved for the Hono rate limiter / cache / queue.
  socialProviders,
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      // No trustedProviders: forced linking without a verified email is a takeover risk.
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
  },
  user: {
    additionalFields: {
      firstName: { type: 'string', required: false, input: false },
      lastName: { type: 'string', required: false, input: false },
    },
  },
  emailAndPassword: { enabled: !IS_PRODUCTION }, // dev/test only
  rateLimit: { enabled: false }, // /api/auth/* is covered by the Hono + Redis limiter
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
    freshAge: SESSION_FRESH_AGE_SECONDS,
  },
  plugins: [expo()],
  trustedOrigins,
});
