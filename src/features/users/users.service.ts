import { NotImplementedError } from '../../errors/NotImplementedError';

export const usersService = {
  getCurrentUser(): never {
    throw new NotImplementedError('Kullanici profil servisi henuz uygulanmadi.');
  },
};
