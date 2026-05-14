import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { interpreterIdParamSchema } from './interpreters.schemas';
import { interpretersService } from './interpreters.service';

export const interpretersRoutes = new Hono();

interpretersRoutes.get('/', (c) => {
  interpretersService.listActiveInterpreters();
  return c.json({ success: true });
});

interpretersRoutes.get('/:id', zValidator('param', interpreterIdParamSchema), (c) => {
  interpretersService.getInterpreterById();
  return c.json({ success: true });
});
