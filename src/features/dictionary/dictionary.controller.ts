import { Hono } from 'hono';
import { zValidator } from '../../utils/zValidator';
import { dictionaryQuerySchema, dictionarySearchQuerySchema } from './dictionary.schemas';
import { dictionaryService } from './dictionary.service';

export const dictionaryRoutes = new Hono();

dictionaryRoutes.get('/', zValidator('query', dictionaryQuerySchema), async (c) => {
  const lang = c.req.valid('query').lang ?? 'tr';

  return c.json({ success: true, data: await dictionaryService.getDictionary(lang) });
});

dictionaryRoutes.get('/search', zValidator('query', dictionarySearchQuerySchema), async (c) => {
  const { q, lang } = c.req.valid('query');

  return c.json({ success: true, data: await dictionaryService.search(q ?? '', lang ?? 'tr') });
});
