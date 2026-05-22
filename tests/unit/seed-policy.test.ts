import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED_MODEL_NAME,
  DEFAULT_SEED_OPENROUTER_MODEL_ID,
  parseSeedPolicy,
} from '../../src/db/seed.policy';

describe('seed policy', () => {
  it('uses local mode by default outside production', () => {
    const policy = parseSeedPolicy({ NODE_ENV: 'development' });

    expect(policy).toEqual({
      mode: 'local',
      openrouterModelId: DEFAULT_SEED_OPENROUTER_MODEL_ID,
      modelName: DEFAULT_SEED_MODEL_NAME,
    });
  });

  it('rejects all production seed attempts', () => {
    expect(() => parseSeedPolicy({
      NODE_ENV: 'production',
      SEED_MODE: 'local',
    })).toThrow(/Seeding is disabled/);
  });

  it('rejects unsupported seed modes', () => {
    expect(() => parseSeedPolicy({
      NODE_ENV: 'development',
      SEED_MODE: 'production',
    })).toThrow(/expected "local"/);
  });

});
