import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { interpreterIdParamSchema } from './interpreters.schemas';
import { interpretersService } from './interpreters.service';

export const interpretersRoutes = new Hono();

interpretersRoutes.get('/', async (c) => {
  const interpreters = await interpretersService.listActiveInterpreters();

  return c.json({ success: true, data: interpreters });
});

interpretersRoutes.get('/:id', zValidator('param', interpreterIdParamSchema), async (c) => {
  const interpreter = await interpretersService.getInterpreterById(c.req.valid('param').id);

  return c.json({ success: true, data: interpreter });
});
