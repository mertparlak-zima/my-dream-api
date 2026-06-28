import { exportPKCS8, generateKeyPair } from 'jose';

/**
 * Generates an ephemeral ES256 private key in PKCS8 PEM form for tests that need
 * to exercise Apple client-secret JWT signing without a real Apple key.
 */
export async function generateTestEs256Pem(): Promise<string> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return exportPKCS8(privateKey);
}
