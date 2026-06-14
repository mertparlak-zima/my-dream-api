import { and, desc, eq, lte, lt, or, sql } from 'drizzle-orm';
import { PLAN_LIMITS } from '../../config';
import {
  CREDIT_TRANSACTION_TYPE,
  DREAM_STATUS,
  PLAN,
  type DreamStatus,
} from '../../constants/domain';
import { db } from '../../db';
import { CreditError } from '../../errors/CreditError';
import { ForbiddenError } from '../../errors/ForbiddenError';
import { NotFoundError } from '../../errors/NotFoundError';
import { ValidationError } from '../../errors/ValidationError';
import { getNextWeeklyResetDate } from '../../utils/date';
import { logger } from '../../utils/logger';
import { creditTransactions } from '../credits/credits.schema';
import { interpreters } from '../interpreters/interpreters.schema';
import { users } from '../users/users.schema';
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

export type DreamListItem = {
  id: string;
  content: string;
  status: DreamStatus;
  isBookmarked: boolean;
  createdAt: string;
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
};

type DreamCursor = {
  createdAt: Date;
  id: string;
};

type SpendTransactionType = typeof CREDIT_TRANSACTION_TYPE.USED_WEEKLY | typeof CREDIT_TRANSACTION_TYPE.USED_EXTRA;

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
} {
  return {
    id: dreams.id,
    content: dreams.content,
    status: dreams.status,
    isBookmarked: dreams.isBookmarked,
    createdAt: dreams.createdAt,
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
    const dream = await db.transaction(async (tx) => {
      const [user] = await tx
        .select({
          plan: users.plan,
          weeklyDreamCount: users.weeklyDreamCount,
          extraCredits: users.extraCredits,
          limitResetDate: users.limitResetDate,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new NotFoundError('Kullanici bulunamadi.');
      }

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

      if (interpreter.isPremium && user.plan === PLAN.FREE) {
        throw new ForbiddenError('Premium yorumcu icin aktif abonelik gerekir.');
      }

      const now = new Date();
      await tx
        .update(users)
        .set({
          weeklyDreamCount: 0,
          limitResetDate: getNextWeeklyResetDate(now),
          updatedAt: now,
        })
        .where(and(eq(users.id, userId), lte(users.limitResetDate, now)));

      const weeklyLimit = PLAN_LIMITS[user.plan];
      let spendType: SpendTransactionType;

      const [weeklySpend] = await tx
        .update(users)
        .set({
          weeklyDreamCount: sql<number>`${users.weeklyDreamCount} + 1`,
          updatedAt: now,
        })
        .where(and(eq(users.id, userId), sql`${users.weeklyDreamCount} < ${weeklyLimit}`))
        .returning({ id: users.id });

      if (weeklySpend) {
        spendType = CREDIT_TRANSACTION_TYPE.USED_WEEKLY;
      } else {
        const [extraSpend] = await tx
          .update(users)
          .set({
            extraCredits: sql<number>`${users.extraCredits} - 1`,
            updatedAt: now,
          })
          .where(and(eq(users.id, userId), sql`${users.extraCredits} > 0`))
          .returning({ id: users.id });

        if (!extraSpend) {
          logger.warn('credit spend failed: insufficient', { op: 'credit.spend', userId });
          throw new CreditError();
        }

        spendType = CREDIT_TRANSACTION_TYPE.USED_EXTRA;
      }

      const [createdDream] = await tx
        .insert(dreams)
        .values({
          userId,
          interpreterId: interpreter.id,
          content: input.content,
          status: DREAM_STATUS.PENDING,
        })
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
          interpreterId: dreams.interpreterId,
        });

      await tx.insert(creditTransactions).values({
        userId,
        transactionType: spendType,
        amount: 1,
        relatedDreamId: createdDream.id,
      });

      return {
        id: createdDream.id,
        content: createdDream.content,
        status: createdDream.status,
        interpretation: createdDream.interpretation,
        userRating: createdDream.userRating,
        userFeedbackText: createdDream.userFeedbackText,
        isBookmarked: createdDream.isBookmarked,
        createdAt: createdDream.createdAt,
        updatedAt: createdDream.updatedAt,
        interpreterId: interpreter.id,
        interpreterName: interpreter.name,
        interpreterDescription: interpreter.description,
        interpreterImageUrl: interpreter.imageUrl,
        interpreterIsPremium: interpreter.isPremium,
        interpreterSortOrder: interpreter.sortOrder,
        interpreterAccentColor: interpreter.accentColor,
      };
    });

    scheduleDreamProcessing(dream.id);
    logger.info('dream created', { op: 'dream.create', userId, dreamId: dream.id });

    return serializeDream(dream);
  },

  async getDreamById(userId: string, dreamId: string): Promise<DreamResponse> {
    return serializeDream(await findOwnedDream(userId, dreamId));
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
