import { describe, expect, it } from 'vitest';
import { decodeJwt, decodeProtectedHeader } from 'jose';

import { generateAppleClientSecret } from '../../src/auth/apple-client-secret';
import { generateTestEs256Pem } from '../helpers/es256';

describe('generateAppleClientSecret', () => {
  it('produces an ES256-signed JWT with Apple-required claims', async () => {
    const pem = await generateTestEs256Pem();

    const jwt = await generateAppleClientSecret('com.zima.service', 'TEAM123456', 'KEY7890AB', pem);

    expect(jwt.split('.')).toHaveLength(3);

    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe('KEY7890AB');

    const claims = decodeJwt(jwt);
    expect(claims.iss).toBe('TEAM123456');
    expect(claims.sub).toBe('com.zima.service');
    expect(claims.aud).toBe('https://appleid.apple.com');
    expect(typeof claims.iat).toBe('number');
    expect(typeof claims.exp).toBe('number');
    // Apple caps client-secret lifetime at ~6 months.
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBeLessThanOrEqual(60 * 60 * 24 * 180);
  });

  it('rejects an invalid PEM key', async () => {
    await expect(
      generateAppleClientSecret('com.zima.service', 'TEAM123456', 'KEY7890AB', 'not-a-pem'),
    ).rejects.toThrow();
  });
});
