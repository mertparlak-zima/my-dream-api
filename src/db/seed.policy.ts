import { z } from 'zod';

const SEED_MODES = ['local'] as const;
export const DEFAULT_SEED_OPENROUTER_MODEL_ID = 'openrouter/free';
export const DEFAULT_SEED_MODEL_NAME = `OpenRouter ${DEFAULT_SEED_OPENROUTER_MODEL_ID}`;

const seedModeSchema = z.enum(SEED_MODES);

export type SeedMode = (typeof SEED_MODES)[number];

export type SeedPolicy = {
  mode: SeedMode;
  openrouterModelId: string;
  modelName: string;
};

function formatSeedError(error: z.ZodError): Error {
  const messages = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return new Error(`Invalid seed config:\n- ${messages.join('\n- ')}`);
}

function parseSeedMode(source: NodeJS.ProcessEnv): SeedMode {
  const rawMode = source.SEED_MODE?.trim();

  if (source.NODE_ENV === 'production') {
    throw new Error('Invalid seed config:\n- Seeding is disabled when NODE_ENV=production.');
  }

  if (!rawMode) {
    return 'local';
  }

  const parsed = seedModeSchema.safeParse(rawMode);

  if (!parsed.success) {
    throw formatSeedError(parsed.error);
  }

  return parsed.data;
}

export function parseSeedPolicy(source: NodeJS.ProcessEnv = process.env): SeedPolicy {
  const mode = parseSeedMode(source);

  return {
    mode,
    openrouterModelId: DEFAULT_SEED_OPENROUTER_MODEL_ID,
    modelName: DEFAULT_SEED_MODEL_NAME,
  };
}
