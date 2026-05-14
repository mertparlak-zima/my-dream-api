import { NotImplementedError } from '../../errors/NotImplementedError';

export const creditsService = {
  getCurrentCredits(): never {
    throw new NotImplementedError('Kredi durumu servisi henuz uygulanmadi.');
  },
};
