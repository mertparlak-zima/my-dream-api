import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Apple is unconfigured in the test env; stub the config + client-secret signing
// so these tests exercise the HTTP contract (not Apple key crypto). The Apple
// endpoints themselves are stubbed via a mocked global fetch.
vi.mock('../../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config')>();
  return {
    ...actual,
    APPLE_APP_BUNDLE_IDENTIFIER: 'com.mydream.app',
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: 'unused-because-client-secret-is-mocked',
  };
});

vi.mock('../../src/auth/apple-client-secret', () => ({
  generateAppleClientSecret: vi.fn().mockResolvedValue('mocked-client-secret'),
}));

import { exchangeAppleAuthorizationCode, revokeAppleToken } from '../../src/auth/apple-token';
import { AppleTokenError } from '../../src/errors/AppleTokenError';

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apple token client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('exchangeAppleAuthorizationCode', () => {
    it('exchanges the code and returns the refresh + access tokens', async () => {
      fetchMock.mockResolvedValue(jsonOk({ refresh_token: 'apple-rt', access_token: 'apple-at' }));

      await expect(exchangeAppleAuthorizationCode('code-1')).resolves.toEqual({
        refreshToken: 'apple-rt',
        accessToken: 'apple-at',
      });

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/auth/token');
      const body = String(options.body);
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=code-1');
      expect(body).toContain('client_id=com.mydream.app');
      expect(body).toContain('client_secret=mocked-client-secret');
    });

    it('maps absent tokens to null (Apple returned none to rotate)', async () => {
      fetchMock.mockResolvedValue(jsonOk({}));

      await expect(exchangeAppleAuthorizationCode('code-2')).resolves.toEqual({
        refreshToken: null,
        accessToken: null,
      });
    });

    it('fails loud with AppleTokenError on a non-2xx Apple response', async () => {
      fetchMock.mockResolvedValue(new Response('invalid_grant', { status: 400 }));

      await expect(exchangeAppleAuthorizationCode('bad-code')).rejects.toBeInstanceOf(AppleTokenError);
    });

    it('fails loud with AppleTokenError when the transport throws', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(exchangeAppleAuthorizationCode('code-3')).rejects.toBeInstanceOf(AppleTokenError);
    });
  });

  describe('revokeAppleToken', () => {
    it('posts the token + hint to the revoke endpoint and resolves on success', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 200 }));

      await expect(revokeAppleToken('apple-rt', 'refresh_token')).resolves.toBeUndefined();

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/auth/revoke');
      const body = String(options.body);
      expect(body).toContain('token=apple-rt');
      expect(body).toContain('token_type_hint=refresh_token');
    });

    it('fails loud with AppleTokenError when Apple rejects the revocation', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 400 }));

      await expect(revokeAppleToken('apple-rt', 'refresh_token')).rejects.toBeInstanceOf(AppleTokenError);
    });
  });
});
