import { NotImplementedError } from '../../errors/NotImplementedError';

export const authService = {
  syncUser(): never {
    throw new NotImplementedError('Auth user sync servisi henuz uygulanmadi.');
  },
};
