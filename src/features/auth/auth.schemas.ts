import { z } from 'zod';

/**
 * Apple only returns the user's name on the very first authorization, so the app
 * calls this once when the name fields are still empty. Identity (email,
 * provider, account) is owned by Better Auth; only profile name is accepted here.
 */
export const bootstrapProfileSchema = z.object({
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
});

export type BootstrapProfileInput = z.infer<typeof bootstrapProfileSchema>;

/**
 * Native Sign in with Apple returns a one-time `authorizationCode` on every
 * sign-in. The app forwards it here so the server can exchange it for a
 * revocable Apple refresh token (needed to revoke the Apple grant at account
 * deletion). Only the opaque code is accepted; no tokens cross this boundary.
 */
export const appleCredentialSchema = z.object({
  authorization_code: z.string().min(1).max(2048),
});

export type AppleCredentialInput = z.infer<typeof appleCredentialSchema>;
