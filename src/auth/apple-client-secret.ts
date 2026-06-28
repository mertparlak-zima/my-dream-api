import { importPKCS8, SignJWT } from 'jose';

const APPLE_AUDIENCE = 'https://appleid.apple.com';
// Apple rejects client secrets whose lifetime exceeds ~6 months.
const MAX_LIFETIME_SECONDS = 60 * 60 * 24 * 180;

/**
 * Builds the Apple "Sign in with Apple" client-secret JWT from the Service ID and
 * the developer-account signing key. Generated at runtime because Apple secrets
 * expire; never store the signed JWT or the private key in the database.
 */
export async function generateAppleClientSecret(
  serviceId: string,
  teamId: string,
  keyId: string,
  privateKeyPem: string,
): Promise<string> {
  const key = await importPKCS8(privateKeyPem, 'ES256');
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + MAX_LIFETIME_SECONDS)
    .setAudience(APPLE_AUDIENCE)
    .setSubject(serviceId)
    .sign(key);
}
