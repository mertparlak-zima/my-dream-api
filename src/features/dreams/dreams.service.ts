import { NotImplementedError } from '../../errors/NotImplementedError';

export const dreamsService = {
  createDream(): never {
    throw new NotImplementedError('Ruya olusturma servisi henuz uygulanmadi.');
  },
  getDreamById(): never {
    throw new NotImplementedError('Ruya polling servisi henuz uygulanmadi.');
  },
  listDreams(): never {
    throw new NotImplementedError('Ruya gecmisi servisi henuz uygulanmadi.');
  },
  submitFeedback(): never {
    throw new NotImplementedError('Ruya geri bildirim servisi henuz uygulanmadi.');
  },
};
