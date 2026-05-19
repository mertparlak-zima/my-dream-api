import { z } from 'zod';

const SEED_MODES = ['local'] as const;

const seedModeSchema = z.enum(SEED_MODES);
const openRouterModelIdSchema = z
  .string()
  .trim()
  .min(1, 'SEED_OPENROUTER_MODEL_ID must not be empty.')
  .refine((value) => !value.toLowerCase().startsWith('mock/'), {
    message: 'SEED_OPENROUTER_MODEL_ID must be a real OpenRouter model id, not mock/*.',
  })
  .refine((value) => value.includes('/'), {
    message: 'SEED_OPENROUTER_MODEL_ID must use provider/model format.',
  });

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
  const rawModelId = source.SEED_OPENROUTER_MODEL_ID ?? 'openai/gpt-5-nano';

  if (!rawModelId) {
    throw new Error('Invalid seed config:\n- SEED_OPENROUTER_MODEL_ID is required.');
  }

  const parsedModelId = openRouterModelIdSchema.safeParse(rawModelId);

  if (!parsedModelId.success) {
    throw formatSeedError(parsedModelId.error);
  }

  return {
    mode,
    openrouterModelId: parsedModelId.data,
    modelName: source.SEED_MODEL_NAME?.trim() || `OpenRouter ${parsedModelId.data}`,
  };
}
