import { describe, expect, it } from 'vitest';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDERS,
  CREDIT_TRANSACTION_TYPE,
  CREDIT_TRANSACTION_TYPES,
  DREAM_STATUS,
  DREAM_STATUSES,
  PLAN,
  PLANS,
} from '../../src/constants/domain';

function expectSyncedEnumShape<T extends readonly string[]>(
  values: T,
  mapping: Record<T[number], T[number]>,
) {
  expect(Object.keys(mapping)).toEqual([...values]);
  expect(Object.values(mapping)).toEqual([...values]);

  for (const value of values) {
    expect(mapping[value]).toBe(value);
  }
}

describe('domain constants contract', () => {
  it('keeps auth providers array and object in sync', () => {
    expectSyncedEnumShape(AUTH_PROVIDERS, AUTH_PROVIDER);
  });

  it('keeps plans array and object in sync', () => {
    expectSyncedEnumShape(PLANS, PLAN);
  });

  it('keeps dream statuses array and object in sync', () => {
    expectSyncedEnumShape(DREAM_STATUSES, DREAM_STATUS);
  });

  it('keeps credit transaction types array and object in sync', () => {
    expectSyncedEnumShape(CREDIT_TRANSACTION_TYPES, CREDIT_TRANSACTION_TYPE);
  });
});
