import { createHash } from 'node:crypto';

import { and, desc, eq, lt, or } from 'drizzle-orm';
import {
  DREAM_STATUS,
  PLAN,
  type DreamStatus,
} from '../../constants/domain';
import { db } from '../../db';
import { ConflictError } from '../../errors/ConflictError';
import { ForbiddenError } from '../../errors/ForbiddenError';
import { NotFoundError } from '../../errors/NotFoundError';
import { ValidationError } from '../../errors/ValidationError';
import { logger } from '../../utils/logger';
import { consumeForDream, ensureUserDomainState } from '../credits/credit-engine';
import { userEntitlements } from '../../db/schema/domain';
import { users } from '../../db/schema/auth';
import { interpreters } from '../interpreters/interpreters.schema';
import { scheduleDreamProcessing } from './dreams.processor';
import { dreams } from './dreams.schema';
import type {
  CreateDreamInput,
  ListDreamsQuery,
  SetBookmarkInput,
  SubmitDreamFeedbackInput,
} from './dreams.schemas';

type InterpreterSummary = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  imageUrl: string | null;
  isPremium: boolean;
  sortOrder: number;
  accentColor: string;
};

type DreamBase = {
  id: string;
  content: string;
  status: DreamStatus;
  interpretation: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DreamResponse = DreamBase & {
  interpreter: InterpreterSummary | null;
  mood: null;
  rating: number | null;
  feedback: string | null;
  isBookmarked: boolean;
};

type DreamListInterpreter = {
  id: string;
  name: string;
  accentColor: string;
};

export type DreamListItem = {
  id: string;
  content: string;
  status: DreamStatus;
  isBookmarked: boolean;
  createdAt: string;
  interpreter: DreamListInterpreter;
};

export type DreamListResponse = {
  items: DreamListItem[];
  nextCursor: string | null;
};

type DreamDetailRow = {
  id: string;
  content: string;
  status: DreamStatus;
  interpretation: string | null;
  userRating: number | null;
  userFeedbackText: string | null;
  isBookmarked: boolean;
  createdAt: Date;
  updatedAt: Date;
  interpreterId: string;
  interpreterName: string;
  interpreterDescription: string;
  interpreterImageUrl: string | null;
  interpreterIsPremium: boolean;
  interpreterSortOrder: number;
  interpreterAccentColor: string;
};

type DreamListRow = {
  id: string;
  content: string;
  status: DreamStatus;
  isBookmarked: boolean;
  createdAt: Date;
  interpreterId: string;
  interpreterName: string;
  interpreterAccentColor: string;
};

type DreamCursor = {
  createdAt: Date;
  id: string;
};

/**
 * Hashes only the immutable client payload (never mutable server state like
 * price or quota), so a network retry with the same client_request_id matches
 * and returns the original dream instead of being rejected as a key reuse.
 */
function computeRequestHash(content: string, interpreterId: string): string {
  return createHash('sha256').update(JSON.stringify({ content, interpreterId })).digest('hex');
}

type DreamRowFields = {
  id: string;
  content: string;
  status: DreamStatus;
  interpretation: string | null;
  userRating: number | null;
  userFeedbackText: string | null;
  isBookmarked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type InterpreterFields = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  isPremium: boolean;
  sortOrder: number;
  accentColor: string;
};

function dreamReturningFields(): {
  id: typeof dreams.id;
  content: typeof dreams.content;
  status: typeof dreams.status;
  interpretation: typeof dreams.interpretation;
  userRating: typeof dreams.userRating;
  userFeedbackText: typeof dreams.userFeedbackText;
  isBookmarked: typeof dreams.isBookmarked;
  createdAt: typeof dreams.createdAt;
  updatedAt: typeof dreams.updatedAt;
} {
  return {
    id: dreams.id,
    content: dreams.content,
    status: dreams.status,
    interpretation: dreams.interpretation,
    userRating: dreams.userRating,
    userFeedbackText: dreams.userFeedbackText,
    isBookmarked: dreams.isBookmarked,
    createdAt: dreams.createdAt,
    updatedAt: dreams.updatedAt,
  };
}

function buildDetailRow(row: DreamRowFields, interpreter: InterpreterFields): DreamDetailRow {
  return {
    ...row,
    interpreterId: interpreter.id,
    interpreterName: interpreter.name,
    interpreterDescription: interpreter.description,
    interpreterImageUrl: interpreter.imageUrl,
    interpreterIsPremium: interpreter.isPremium,
    interpreterSortOrder: interpreter.sortOrder,
    interpreterAccentColor: interpreter.accentColor,
  };
}

function serializeDream(row: DreamDetailRow): DreamResponse {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    interpretation: row.interpretation,
    interpreter: {
      id: row.interpreterId,
      name: row.interpreterName,
      specialty: row.interpreterDescription,
      description: row.interpreterDescription,
      imageUrl: row.interpreterImageUrl,
      isPremium: row.interpreterIsPremium,
      sortOrder: row.interpreterSortOrder,
      accentColor: row.interpreterAccentColor,
    },
    mood: null,
    rating: row.userRating,
    feedback: row.userFeedbackText,
    isBookmarked: row.isBookmarked,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDreamListItem(row: DreamListRow): DreamListItem {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    isBookmarked: row.isBookmarked,
    createdAt: row.createdAt.toISOString(),
    interpreter: {
      id: row.interpreterId,
      name: row.interpreterName,
      accentColor: row.interpreterAccentColor,
    },
  };
}

function dreamDetailSelectFields(): {
  id: typeof dreams.id;
  content: typeof dreams.content;
  status: typeof dreams.status;
  interpretation: typeof dreams.interpretation;
  userRating: typeof dreams.userRating;
  userFeedbackText: typeof dreams.userFeedbackText;
  isBookmarked: typeof dreams.isBookmarked;
  createdAt: typeof dreams.createdAt;
  updatedAt: typeof dreams.updatedAt;
  interpreterId: typeof interpreters.id;
  interpreterName: typeof interpreters.name;
  interpreterDescription: typeof interpreters.description;
  interpreterImageUrl: typeof interpreters.imageUrl;
  interpreterIsPremium: typeof interpreters.isPremium;
  interpreterSortOrder: typeof interpreters.sortOrder;
  interpreterAccentColor: typeof interpreters.accentColor;
} {
  return {
    id: dreams.id,
    content: dreams.content,
    status: dreams.status,
    interpretation: dreams.interpretation,
    userRating: dreams.userRating,
    userFeedbackText: dreams.userFeedbackText,
    isBookmarked: dreams.isBookmarked,
    createdAt: dreams.createdAt,
    updatedAt: dreams.updatedAt,
    interpreterId: interpreters.id,
    interpreterName: interpreters.name,
    interpreterDescription: interpreters.description,
    interpreterImageUrl: interpreters.imageUrl,
    interpreterIsPremium: interpreters.isPremium,
    interpreterSortOrder: interpreters.sortOrder,
    interpreterAccentColor: interpreters.accentColor,
  };
}

function dreamListSelectFields(): {
  id: typeof dreams.id;
  content: typeof dreams.content;
  status: typeof dreams.status;
  isBookmarked: typeof dreams.isBookmarked;
  createdAt: typeof dreams.createdAt;
  interpreterId: typeof interpreters.id;
  interpreterName: typeof interpreters.name;
  interpreterAccentColor: typeof interpreters.accentColor;
} {
  return {
    id: dreams.id,
    content: dreams.content,
    status: dreams.status,
    isBookmarked: dreams.isBookmarked,
    createdAt: dreams.createdAt,
    interpreterId: interpreters.id,
    interpreterName: interpreters.name,
    interpreterAccentColor: interpreters.accentColor,
  };
}

function encodeDreamCursor(cursor: DreamCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeDreamCursor(cursor: string): DreamCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };

    if (!parsed.createdAt || !parsed.id) {
      throw new Error('Missing cursor fields.');
    }

    const createdAt = new Date(parsed.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('Invalid cursor date.');
    }

    return { createdAt, id: parsed.id };
  } catch {
    throw new ValidationError('Gecersiz cursor.');
  }
}

async function findOwnedDream(userId: string, dreamId: string): Promise<DreamDetailRow> {
  const [dream] = await db
    .select(dreamDetailSelectFields())
    .from(dreams)
    .innerJoin(interpreters, eq(dreams.interpreterId, interpreters.id))
    .where(and(eq(dreams.id, dreamId), eq(dreams.userId, userId)))
    .limit(1);

  if (!dream) {
    throw new NotFoundError('Ruya bulunamadi.');
  }

  return dream;
}

export const dreamsService = {
  async createDream(userId: string, input: CreateDreamInput): Promise<DreamResponse> {
    const requestHash = computeRequestHash(input.content, input.interpreter_id);

    const result = await db.transaction(async (tx) => {
      // Identity is owned by Better Auth; reject unknown ids before provisioning
      // domain rows (whose FKs would otherwise fail loudly).
      const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      if (!owner) {
        throw new NotFoundError('Kullanici bulunamadi.');
      }

      await ensureUserDomainState(tx, userId);

      const [entitlement] = await tx
        .select({ plan: userEntitlements.plan })
        .from(userEntitlements)
        .where(eq(userEntitlements.userId, userId))
        .limit(1);
      /* v8 ignore next -- ensureUserDomainState above guarantees the entitlement row */
      const plan = entitlement?.plan ?? PLAN.FREE;

      const [interpreter] = await tx
        .select({
          id: interpreters.id,
          name: interpreters.name,
          description: interpreters.description,
          imageUrl: interpreters.imageUrl,
          isPremium: interpreters.isPremium,
          sortOrder: interpreters.sortOrder,
          accentColor: interpreters.accentColor,
        })
        .from(interpreters)
        .where(and(eq(interpreters.id, input.interpreter_id), eq(interpreters.isActive, true)))
        .limit(1);

      if (!interpreter) {
        throw new NotFoundError('Yorumcu bulunamadi.');
      }

      if (interpreter.isPremium && plan === PLAN.FREE) {
        throw new ForbiddenError('Premium yorumcu icin aktif abonelik gerekir.');
      }

      const now = new Date();

      // Idempotent insert: a retry with the same client_request_id does not insert.
      const [created] = await tx
        .insert(dreams)
        .values({
          userId,
          interpreterId: interpreter.id,
          content: input.content,
          status: DREAM_STATUS.PENDING,
          clientRequestId: input.client_request_id,
          requestHash,
          queuedAt: now,
        })
        .onConflictDoNothing({ target: [dreams.userId, dreams.clientRequestId] })
        .returning(dreamReturningFields());

      if (!created) {
        // Same key already exists: replay if the payload matches, else reject.
        const [existing] = await tx
          .select({ ...dreamReturningFields(), requestHash: dreams.requestHash })
          .from(dreams)
          .where(and(eq(dreams.userId, userId), eq(dreams.clientRequestId, input.client_request_id)))
          .limit(1);

        /* v8 ignore next 3 -- defensive: within one tx a conflicting row is always visible */
        if (!existing) {
          throw new ConflictError('Istek islenemedi, lutfen tekrar deneyin.');
        }

        if (existing.requestHash !== requestHash) {
          throw new ConflictError('Bu istek anahtari farkli bir icerikle kullanilmis.', 'IDEMPOTENCY_KEY_REUSED');
        }

        return { row: buildDetailRow(existing, interpreter), created: false };
      }

      // Charge the dream (quota first, then wallet) and persist the billing trail.
      const charge = await consumeForDream(tx, userId, plan, created.id, now);
      await tx
        .update(dreams)
        .set({
          quotaSource: charge.quotaSource,
          quotaKey: charge.quotaKey,
          quotaWindowStartedAt: charge.quotaWindowStartedAt,
          quotaUnitsConsumed: charge.quotaUnitsConsumed,
          usedCoins: charge.usedCoins,
          usedCost: charge.usedCost,
          chargedTransactionId: charge.chargedTransactionId,
        })
        .where(eq(dreams.id, created.id));

      return { row: buildDetailRow(created, interpreter), created: true };
    });

    if (result.created) {
      scheduleDreamProcessing(result.row.id);
      logger.info('dream created', { op: 'dream.create', userId, dreamId: result.row.id });
    }

    return serializeDream(result.row);
  },

  async getDreamById(userId: string, dreamId: string): Promise<DreamResponse> {
    return serializeDream(await findOwnedDream(userId, dreamId));
  },

  // Lets the app recover after a crash/restart: look up the dream a still-pending
  // local submission may have already created, keyed by its client_request_id.
  async getDreamByClientRequestId(userId: string, clientRequestId: string): Promise<DreamResponse> {
    const [dream] = await db
      .select(dreamDetailSelectFields())
      .from(dreams)
      .innerJoin(interpreters, eq(dreams.interpreterId, interpreters.id))
      .where(and(eq(dreams.userId, userId), eq(dreams.clientRequestId, clientRequestId)))
      .limit(1);

    if (!dream) {
      throw new NotFoundError('Ruya bulunamadi.');
    }

    return serializeDream(dream);
  },

  async deleteDream(userId: string, dreamId: string): Promise<void> {
    const [deleted] = await db
      .delete(dreams)
      .where(and(eq(dreams.id, dreamId), eq(dreams.userId, userId)))
      .returning({ id: dreams.id });

    if (!deleted) {
      throw new NotFoundError('Ruya bulunamadi.');
    }

    logger.info('dream deleted', { op: 'dream.delete', userId, dreamId });
  },

  async setBookmark(userId: string, dreamId: string, input: SetBookmarkInput): Promise<DreamResponse> {
    const [updatedDream] = await db
      .update(dreams)
      .set({ isBookmarked: input.bookmarked, updatedAt: new Date() })
      .from(interpreters)
      .where(
        and(
          eq(dreams.id, dreamId),
          eq(dreams.userId, userId),
          eq(dreams.interpreterId, interpreters.id),
        ),
      )
      .returning({
        id: dreams.id,
        content: dreams.content,
        status: dreams.status,
        interpretation: dreams.interpretation,
        userRating: dreams.userRating,
        userFeedbackText: dreams.userFeedbackText,
        isBookmarked: dreams.isBookmarked,
        createdAt: dreams.createdAt,
        updatedAt: dreams.updatedAt,
        interpreterId: interpreters.id,
        interpreterName: interpreters.name,
        interpreterDescription: interpreters.description,
        interpreterImageUrl: interpreters.imageUrl,
        interpreterIsPremium: interpreters.isPremium,
        interpreterSortOrder: interpreters.sortOrder,
        interpreterAccentColor: interpreters.accentColor,
      });

    if (!updatedDream) {
      throw new NotFoundError('Ruya bulunamadi.');
    }

    return serializeDream(updatedDream);
  },

  async listDreams(userId: string, query: ListDreamsQuery): Promise<DreamListResponse> {
    const cursor = query.cursor ? decodeDreamCursor(query.cursor) : null;
    const whereConditions = [eq(dreams.userId, userId)];

    if (query.bookmarked !== undefined) {
      whereConditions.push(eq(dreams.isBookmarked, query.bookmarked === 'true'));
    }

    if (cursor) {
      const cursorCondition = or(
        lt(dreams.createdAt, cursor.createdAt),
        and(eq(dreams.createdAt, cursor.createdAt), lt(dreams.id, cursor.id)),
      );

      if (cursorCondition) {
        whereConditions.push(cursorCondition);
      }
    }

    const rows = await db
      .select(dreamListSelectFields())
      .from(dreams)
      .innerJoin(interpreters, eq(dreams.interpreterId, interpreters.id))
      .where(and(...whereConditions))
      .orderBy(desc(dreams.createdAt), desc(dreams.id))
      .limit(query.limit + 1);

    const pageRows = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;

    return {
      items: pageRows.map(serializeDreamListItem),
      nextCursor: hasMore && pageRows.length > 0 ? encodeDreamCursor(pageRows[pageRows.length - 1]!) : null,
    };
  },

  async submitFeedback(userId: string, dreamId: string, input: SubmitDreamFeedbackInput): Promise<DreamResponse> {
    const [updatedDream] = await db
      .update(dreams)
      .set({
        userRating: input.rating,
        userFeedbackText: input.feedback_text ?? null,
        updatedAt: new Date(),
      })
      .from(interpreters)
      .where(
        and(
          eq(dreams.id, dreamId),
          eq(dreams.userId, userId),
          eq(dreams.interpreterId, interpreters.id),
          eq(dreams.status, DREAM_STATUS.COMPLETED),
        ),
      )
      .returning({
        id: dreams.id,
        content: dreams.content,
        status: dreams.status,
        interpretation: dreams.interpretation,
        userRating: dreams.userRating,
        userFeedbackText: dreams.userFeedbackText,
        isBookmarked: dreams.isBookmarked,
        createdAt: dreams.createdAt,
        updatedAt: dreams.updatedAt,
        interpreterId: interpreters.id,
        interpreterName: interpreters.name,
        interpreterDescription: interpreters.description,
        interpreterImageUrl: interpreters.imageUrl,
        interpreterIsPremium: interpreters.isPremium,
        interpreterSortOrder: interpreters.sortOrder,
        interpreterAccentColor: interpreters.accentColor,
      });

    if (!updatedDream) {
      const [dream] = await db
        .select({
          status: dreams.status,
        })
        .from(dreams)
        .where(and(eq(dreams.id, dreamId), eq(dreams.userId, userId)))
        .limit(1);

      if (!dream) {
        throw new NotFoundError('Ruya bulunamadi.');
      }

      if (dream.status !== DREAM_STATUS.COMPLETED) {
        throw new ForbiddenError('Sadece tamamlanmis ruyalar icin geri bildirim verilebilir.');
      }

      throw new ValidationError('Geri bildirim kaydedilemedi.');
    }

    return serializeDream(updatedDream);
  },
};
