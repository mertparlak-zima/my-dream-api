import { NotImplementedError } from '../../errors/NotImplementedError';

export const interpretersService = {
  listActiveInterpreters(): never {
    throw new NotImplementedError('Yorumcu listeleme servisi henuz uygulanmadi.');
  },
  getInterpreterById(): never {
    throw new NotImplementedError('Yorumcu detay servisi henuz uygulanmadi.');
  },
};
