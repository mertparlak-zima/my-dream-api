import {
  APPLE_APP_BUNDLE_IDENTIFIER,
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY,
  APPLE_TEAM_ID,
} from '../config';
import { AppleTokenError } from '../errors/AppleTokenError';
import { logger } from '../utils/logger';
import { generateAppleClientSecret } from './apple-client-secret';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** Tokens Apple may issue when exchanging a native authorization code. */
export type AppleTokenSet = {
  refreshToken: string | null;
  accessToken: string | null;
};

export type AppleTokenTypeHint = 'refresh_token' | 'access_token';

/**
 * Native Sign in with Apple issues the authorization code to the app's bundle
 * identifier (not the Service ID used by the web/redirect flow), so the
 * client-secret JWT for the token endpoint must carry the *bundle id* as its
 * subject. Generated per call because Apple secrets are short-lived; never
 * persisted.
 */
async function appleClientCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  if (
    !APPLE_APP_BUNDLE_IDENTIFIER
    || !APPLE_TEAM_ID
    || !APPLE_KEY_ID
    || !APPLE_PRIVATE_KEY
  ) {
    // Reached only if a caller invokes this while Apple is unconfigured. Fail
    // loud instead of silently no-op'ing a security-relevant token call.
    throw new AppleTokenError('Apple kimlik doğrulaması yapılandırılmamış.');
  }

  const clientSecret = await generateAppleClientSecret(
    APPLE_APP_BUNDLE_IDENTIFIER,
    APPLE_TEAM_ID,
    APPLE_KEY_ID,
    APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  );

  return { clientId: APPLE_APP_BUNDLE_IDENTIFIER, clientSecret };
}

async function appleFormPost(url: string, params: Record<string, string>): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  } catch (cause) {
    // Network/transport failure — never swallow; the caller decides (deletion
    // aborts fail-loud, sign-in exchange is best-effort and logs).
    throw new AppleTokenError(
      cause instanceof Error ? `Apple isteği başarısız: ${cause.message}` : 'Apple isteği başarısız.',
    );
  }

  return response;
}

/**
 * Exchanges a native Sign in with Apple authorization code for Apple's tokens.
 * Apple only returns a `refresh_token` from this exchange (the native id-token
 * sign-in path never yields one), which is what we persist so the token can
 * later be revoked at account deletion (App Store Guideline 5.1.1(v)).
 */
export async function exchangeAppleAuthorizationCode(code: string): Promise<AppleTokenSet> {
  const { clientId, clientSecret } = await appleClientCredentials();

  const response = await appleFormPost(APPLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.warn('apple token exchange failed', {
      op: 'apple.token.exchange',
      status: response.status,
      detail: detail.slice(0, 200),
    });
    throw new AppleTokenError('Apple yetkilendirme kodu doğrulanamadı.');
  }

  const payload = (await response.json().catch(() => ({}))) as {
    refresh_token?: string;
    access_token?: string;
  };

  return {
    refreshToken: payload.refresh_token ?? null,
    accessToken: payload.access_token ?? null,
  };
}

/**
 * Revokes an Apple token so the next Sign in with Apple is treated as a fresh
 * authorization (Apple re-shares email/name). Used at account deletion. Throws
 * (fail-loud) when Apple rejects the request so deletion can be blocked rather
 * than leaving a live Apple grant behind.
 */
export async function revokeAppleToken(token: string, tokenTypeHint: AppleTokenTypeHint): Promise<void> {
  const { clientId, clientSecret } = await appleClientCredentials();

  const response = await appleFormPost(APPLE_REVOKE_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokenTypeHint,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.warn('apple token revoke failed', {
      op: 'apple.token.revoke',
      status: response.status,
      detail: detail.slice(0, 200),
    });
    throw new AppleTokenError('Apple oturumu iptal edilemedi.');
  }
}
