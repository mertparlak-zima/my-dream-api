import type { OpenAPIHono, RouteConfig } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { DREAM_CONFIG } from '../config';
import { AUTH_PROVIDERS, DREAM_STATUSES, LANGUAGES, PLANS, TEXT_SIZES } from '../constants/domain';

const bearerSecurity = [{ BearerAuth: [] }];

const ErrorEnvelopeSchema = z
  .object({
    success: z.literal(false).openapi({ example: false }),
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string().openapi({ example: 'Istek verileri gecersiz.' }),
      issues: z.array(z.unknown()).optional(),
    }),
  })
  .openapi('ErrorEnvelope');

const HealthResponseSchema = z
  .object({
    success: z.literal(true).openapi({ example: true }),
    status: z.literal('ok').openapi({ example: 'ok' }),
  })
  .openapi('HealthResponse');

const AuthProviderSchema = z.enum(AUTH_PROVIDERS).openapi('AuthProvider');
const PlanSchema = z.enum(PLANS).openapi('Plan');
const DreamStatusSchema = z.enum(DREAM_STATUSES).openapi('DreamStatus');
const UuidSchema = z.uuid().openapi({ example: '00000000-0000-4000-8000-000000000001' });
const IsoDateSchema = z.iso.datetime().openapi({ example: '2026-05-16T08:03:52.319Z' });

const DreamIdParamSchema = z.object({
  id: z.uuid().openapi({
    param: {
      name: 'id',
      in: 'path',
    },
    example: '10eb23d2-19cf-4fcb-8fe2-78517ebd3379',
  }),
});

const InterpreterIdParamSchema = z.object({
  id: z.uuid().openapi({
    param: {
      name: 'id',
      in: 'path',
    },
    example: '20000000-0000-4000-8000-000000000001',
  }),
});

const SyncUserRequestSchema = z
  .object({
    email: z.string().email().openapi({ example: 'dev@mydream.local' }),
    auth_provider: AuthProviderSchema.openapi({ example: 'GOOGLE' }),
    provider_id: z.string().min(1).openapi({ example: 'google-user-id' }),
    first_name: z.string().min(1).max(120).optional().openapi({ example: 'Dev' }),
    last_name: z.string().min(1).max(120).optional().openapi({ example: 'User' }),
  })
  .openapi('SyncUserRequest');

const UserSchema = z
  .object({
    id: UuidSchema,
    email: z.string().email().openapi({ example: 'dev@mydream.local' }),
    auth_provider: AuthProviderSchema,
    provider_id: z.string().openapi({ example: 'dev-provider' }),
    first_name: z.string().nullable().openapi({ example: 'Dev' }),
    last_name: z.string().nullable().openapi({ example: 'User' }),
    plan: PlanSchema,
    weekly_dream_count: z.number().int().openapi({ example: 0 }),
    weekly_limit: z.number().int().openapi({ example: 1 }),
    limit_reset_date: IsoDateSchema,
    extra_credits: z.number().int().openapi({ example: 5 }),
    created_at: IsoDateSchema,
    updated_at: IsoDateSchema,
  })
  .openapi('User');

const CreditSummarySchema = z
  .object({
    plan: PlanSchema,
    weekly_dream_count: z.number().int().openapi({ example: 0 }),
    weekly_limit: z.number().int().openapi({ example: 1 }),
    weekly_remaining: z.number().int().openapi({ example: 1 }),
    extra_credits: z.number().int().openapi({ example: 5 }),
    limit_reset_date: IsoDateSchema,
  })
  .openapi('CreditSummary');

const InterpreterSchema = z
  .object({
    id: UuidSchema,
    name: z.string().openapi({ example: 'Psikolog Selin' }),
    description: z.string().openapi({ example: 'Modern psikoloji perspektifiyle sakin ve analitik ruya yorumu yapar.' }),
    image_url: z.string().url().nullable().openapi({ example: null }),
    is_premium: z.boolean().openapi({ example: false }),
    sort_order: z.number().int().openapi({ example: 10 }),
  })
  .openapi('Interpreter');

const DreamInterpreterSchema = z
  .object({
    id: UuidSchema,
    name: z.string().openapi({ example: 'Psikolog Selin' }),
    specialty: z.string().openapi({ example: 'Modern psikoloji perspektifiyle sakin ve analitik ruya yorumu yapar.' }),
    description: z.string().openapi({ example: 'Modern psikoloji perspektifiyle sakin ve analitik ruya yorumu yapar.' }),
    imageUrl: z.string().url().nullable().openapi({ example: null }),
    isPremium: z.boolean().openapi({ example: false }),
    sortOrder: z.number().int().openapi({ example: 10 }),
  })
  .openapi('DreamInterpreter');

const DreamSchema = z
  .object({
    id: UuidSchema,
    content: z.string().openapi({ example: 'Uzun bir koridorda yuruyordum ve deniz sesi duyuyordum.' }),
    status: DreamStatusSchema,
    interpretation: z.string().nullable().openapi({ example: 'Psikolog Selin yorumu: Bu ruya...' }),
    interpreter: DreamInterpreterSchema.nullable(),
    mood: z.null().openapi({ example: null }),
    rating: z.number().int().min(DREAM_CONFIG.MIN_RATING).max(DREAM_CONFIG.MAX_RATING).nullable().openapi({ example: 8 }),
    feedback: z.string().nullable().openapi({ example: 'Yorum faydaliydi.' }),
    isBookmarked: z.boolean().openapi({ example: false }),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .openapi('Dream');

const DreamListItemSchema = z
  .object({
    id: UuidSchema,
    content: z.string().openapi({ example: 'Uzun bir koridorda yuruyordum ve deniz sesi duyuyordum.' }),
    status: DreamStatusSchema,
    isBookmarked: z.boolean().openapi({ example: false }),
    createdAt: IsoDateSchema,
  })
  .openapi('DreamListItem');

const DreamListPageSchema = z
  .object({
    items: z.array(DreamListItemSchema),
    nextCursor: z.string().nullable().openapi({ example: null }),
  })
  .openapi('DreamListPage');

const CreateDreamRequestSchema = z
  .object({
    content: z.string().min(DREAM_CONFIG.MIN_CONTENT_LENGTH).max(DREAM_CONFIG.MAX_CONTENT_LENGTH).openapi({
      example: 'Uzun bir koridorda yurumeye calisiyordum, kapilar aciliyor ama deniz sesi duyuyordum.',
    }),
    interpreter_id: z.uuid().openapi({ example: '20000000-0000-4000-8000-000000000001' }),
  })
  .openapi('CreateDreamRequest');

const ListDreamsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
    param: {
      name: 'limit',
      in: 'query',
    },
    example: 20,
  }),
  cursor: z.string().max(200).optional().openapi({
    param: {
      name: 'cursor',
      in: 'query',
    },
    example: null,
  }),
  bookmarked: z.enum(['true', 'false']).optional().openapi({
    param: {
      name: 'bookmarked',
      in: 'query',
    },
    example: 'true',
  }),
});

const SubmitFeedbackRequestSchema = z
  .object({
    rating: z.number().int().min(DREAM_CONFIG.MIN_RATING).max(DREAM_CONFIG.MAX_RATING).openapi({ example: 8 }),
    feedback_text: z.string().max(DREAM_CONFIG.MAX_FEEDBACK_LENGTH).optional().openapi({ example: 'Yorum faydaliydi.' }),
  })
  .openapi('SubmitFeedbackRequest');

const SetBookmarkRequestSchema = z
  .object({
    bookmarked: z.boolean().openapi({ example: true }),
  })
  .openapi('SetBookmarkRequest');

const TextSizeSchema = z.enum(TEXT_SIZES).openapi('TextSize');
const LanguageSchema = z.enum(LANGUAGES).openapi('Language');

const PreferencesSchema = z
  .object({
    text_size: TextSizeSchema.openapi({ example: 'normal' }),
    language: LanguageSchema.openapi({ example: 'tr' }),
  })
  .openapi('Preferences');

const UpdatePreferencesRequestSchema = z
  .object({
    text_size: TextSizeSchema.optional().openapi({ example: 'large' }),
    language: LanguageSchema.optional().openapi({ example: 'en' }),
  })
  .openapi('UpdatePreferencesRequest');

const PreferencesEnvelopeSchema = z
  .object({ success: z.literal(true), data: PreferencesSchema })
  .openapi('PreferencesEnvelope');

const UserEnvelopeSchema = z.object({ success: z.literal(true), data: UserSchema }).openapi('UserEnvelope');
const CreditEnvelopeSchema = z.object({ success: z.literal(true), data: CreditSummarySchema }).openapi('CreditEnvelope');
const InterpreterEnvelopeSchema = z.object({ success: z.literal(true), data: InterpreterSchema }).openapi('InterpreterEnvelope');
const InterpreterListEnvelopeSchema = z.object({ success: z.literal(true), data: z.array(InterpreterSchema) }).openapi('InterpreterListEnvelope');
const DreamEnvelopeSchema = z.object({ success: z.literal(true), data: DreamSchema }).openapi('DreamEnvelope');
const DreamListEnvelopeSchema = z.object({ success: z.literal(true), data: DreamListPageSchema }).openapi('DreamListEnvelope');

const routes: RouteConfig[] = [
  {
    method: 'get',
    path: '/health',
    tags: ['System'],
    summary: 'Health check',
    responses: {
      200: {
        description: 'API is healthy.',
        content: {
          'application/json': {
            schema: HealthResponseSchema,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/auth/sync',
    tags: ['Auth'],
    summary: 'Sync authenticated user',
    security: bearerSecurity,
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: SyncUserRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Synced user.',
        content: {
          'application/json': {
            schema: UserEnvelopeSchema,
          },
        },
      },
      400: {
        description: 'Validation error.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/users/me',
    tags: ['Users'],
    summary: 'Get current user',
    security: bearerSecurity,
    responses: {
      200: {
        description: 'Current user.',
        content: {
          'application/json': {
            schema: UserEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      404: {
        description: 'User not found.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/users/me/preferences',
    tags: ['Users'],
    summary: 'Get current user UI preferences',
    security: bearerSecurity,
    responses: {
      200: {
        description: 'User preferences (column defaults when none set).',
        content: {
          'application/json': {
            schema: PreferencesEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'patch',
    path: '/users/me/preferences',
    tags: ['Users'],
    summary: 'Update current user UI preferences',
    security: bearerSecurity,
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: UpdatePreferencesRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated preferences.',
        content: {
          'application/json': {
            schema: PreferencesEnvelopeSchema,
          },
        },
      },
      400: {
        description: 'Validation error.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/interpreters',
    tags: ['Interpreters'],
    summary: 'List active interpreters',
    responses: {
      200: {
        description: 'Active interpreters sorted by product order.',
        content: {
          'application/json': {
            schema: InterpreterListEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/interpreters/{id}',
    tags: ['Interpreters'],
    summary: 'Get active interpreter',
    request: {
      params: InterpreterIdParamSchema,
    },
    responses: {
      200: {
        description: 'Interpreter detail.',
        content: {
          'application/json': {
            schema: InterpreterEnvelopeSchema,
          },
        },
      },
      400: {
        description: 'Validation error.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      404: {
        description: 'Interpreter not found.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/credits/me',
    tags: ['Credits'],
    summary: 'Get current credit state',
    security: bearerSecurity,
    responses: {
      200: {
        description: 'Current credit summary.',
        content: {
          'application/json': {
            schema: CreditEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      404: {
        description: 'User not found.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/dreams',
    tags: ['Dreams'],
    summary: 'Create dream interpretation request',
    security: bearerSecurity,
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: CreateDreamRequestSchema,
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Dream accepted and queued for AI processing.',
        content: {
          'application/json': {
            schema: DreamEnvelopeSchema,
          },
        },
      },
      400: {
        description: 'Validation error.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      402: {
        description: 'Insufficient credits.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      403: {
        description: 'Forbidden plan or interpreter access.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      404: {
        description: 'Interpreter or user not found.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/dreams',
    tags: ['Dreams'],
    summary: 'List user dreams',
    security: bearerSecurity,
    request: {
      query: ListDreamsQuerySchema,
    },
    responses: {
      200: {
        description: 'User dream list sorted by createdAt descending.',
        content: {
          'application/json': {
            schema: DreamListEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/dreams/{id}',
    tags: ['Dreams'],
    summary: 'Get user dream for polling or detail',
    security: bearerSecurity,
    request: {
      params: DreamIdParamSchema,
    },
    responses: {
      200: {
        description: 'Owned dream detail.',
        content: {
          'application/json': {
            schema: DreamEnvelopeSchema,
          },
        },
      },
      400: {
        description: 'Validation error.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      404: {
        description: 'Dream not found or not owned by user.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'patch',
    path: '/dreams/{id}/bookmark',
    tags: ['Dreams'],
    summary: 'Set or clear the bookmark flag on a dream',
    security: bearerSecurity,
    request: {
      params: DreamIdParamSchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: SetBookmarkRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated dream with the new bookmark state.',
        content: {
          'application/json': {
            schema: DreamEnvelopeSchema,
          },
        },
      },
      400: {
        description: 'Validation error.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      404: {
        description: 'Dream not found or not owned by user.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
  {
    method: 'patch',
    path: '/dreams/{id}/feedback',
    tags: ['Dreams'],
    summary: 'Submit dream feedback',
    security: bearerSecurity,
    request: {
      params: DreamIdParamSchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: SubmitFeedbackRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated dream with feedback.',
        content: {
          'application/json': {
            schema: DreamEnvelopeSchema,
          },
        },
      },
      400: {
        description: 'Validation error.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      401: {
        description: 'Missing or invalid authentication.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      403: {
        description: 'Feedback is only accepted for completed dreams.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      404: {
        description: 'Dream not found or not owned by user.',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  },
];

export function registerOpenApi(app: OpenAPIHono): void {
  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  for (const route of routes) {
    app.openAPIRegistry.registerPath(route);
  }
}
