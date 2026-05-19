import { describe, expect, it } from 'vitest';
import { parseSeedPolicy } from '../../src/db/seed.policy';

describe('seed policy', () => {
  it('uses local mode by default outside production', () => {
    const policy = parseSeedPolicy({ NODE_ENV: 'development' });

    expect(policy).toEqual({
      mode: 'local',
      openrouterModelId: 'openai/gpt-5-nano',
      modelName: 'OpenRouter openai/gpt-5-nano',
    });
  });

  it('rejects all production seed attempts', () => {
    expect(() => parseSeedPolicy({
      NODE_ENV: 'production',
      SEED_MODE: 'local',
      SEED_OPENROUTER_MODEL_ID: 'openai/gpt-5-nano',
    })).toThrow(/Seeding is disabled/);
  });

  it('rejects unsupported seed modes', () => {
    expect(() => parseSeedPolicy({
      NODE_ENV: 'development',
      SEED_MODE: 'production',
      SEED_OPENROUTER_MODEL_ID: 'openai/gpt-5-nano',
    })).toThrow(/expected "local"/);
  });

  it('rejects mock model ids in local seed mode', () => {
    expect(() => parseSeedPolicy({
      NODE_ENV: 'development',
      SEED_MODE: 'local',
      SEED_OPENROUTER_MODEL_ID: 'mock/my-dream-interpreter',
    })).toThrow(/not mock/);
  });

  it('accepts local model config', () => {
    const policy = parseSeedPolicy({
      NODE_ENV: 'development',
      SEED_MODE: 'local',
      SEED_OPENROUTER_MODEL_ID: 'openai/gpt-5-nano',
      SEED_MODEL_NAME: 'GPT 5 Nano',
    });

    expect(policy).toEqual({
      mode: 'local',
      openrouterModelId: 'openai/gpt-5-nano',
      modelName: 'GPT 5 Nano',
    });
  });
});
