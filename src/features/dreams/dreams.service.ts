import { and, desc, eq, lte, sql } from 'drizzle-orm';
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
import { creditTransactions } from '../credits/credits.schema';
import { interpreters } from '../interpreters/interpreters.schema';
import { users } from '../users/users.schema';
import { scheduleDreamProcessing } from './dreams.processor';
import { dreams } from './dreams.schema';
import type { CreateDreamInput, ListDreamsQuery, SubmitDreamFeedbackInput } from './dreams.schemas';

type InterpreterSummary = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  imageUrl: string | null;
  isPremium: boolean;
  sortOrder: number;
};

export type DreamResponse = {
  id: string;
  content: string;
  status: DreamStatus;
  interpretation: string | null;
  interpreter: InterpreterSummary | null;
  mood: null;
  rating: number | null;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
};

type DreamSelectRow = {
  id: string;
  content: string;
  status: DreamStatus;
  interpretation: string | null;
  userRating: number | null;
  userFeedbackText: string | null;
  createdAt: Date;
  updatedAt: Date;
  interpreterId: string;
  interpreterName: string;
  interpreterDescription: string;
  interpreterImageUrl: string | null;
  interpreterIsPremium: boolean;
  interpreterSortOrder: number;
};

type SpendTransactionType = typeof CREDIT_TRANSACTION_TYPE.USED_WEEKLY | typeof CREDIT_TRANSACTION_TYPE.USED_EXTRA;

function serializeDream(row: DreamSelectRow): DreamResponse {
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
    },
    mood: null,
    rating: row.userRating,
    feedback: row.userFeedbackText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dreamSelectFields(): {
  id: typeof dreams.id;
  content: typeof dreams.content;
  status: typeof dreams.status;
  interpretation: typeof dreams.interpretation;
  userRating: typeof dreams.userRating;
  userFeedbackText: typeof dreams.userFeedbackText;
  createdAt: typeof dreams.createdAt;
  updatedAt: typeof dreams.updatedAt;
  interpreterId: typeof interpreters.id;
  interpreterName: typeof interpreters.name;
  interpreterDescription: typeof interpreters.description;
  interpreterImageUrl: typeof interpreters.imageUrl;
  interpreterIsPremium: typeof interpreters.isPremium;
  interpreterSortOrder: typeof interpreters.sortOrder;
} {
  return {
    id: dreams.id,
    content: dreams.content,
    status: dreams.status,
    interpretation: dreams.interpretation,
    userRating: dreams.userRating,
    userFeedbackText: dreams.userFeedbackText,
    createdAt: dreams.createdAt,
    updatedAt: dreams.updatedAt,
    interpreterId: interpreters.id,
    interpreterName: interpreters.name,
    interpreterDescription: interpreters.description,
    interpreterImageUrl: interpreters.imageUrl,
    interpreterIsPremium: interpreters.isPremium,
    interpreterSortOrder: interpreters.sortOrder,
  };
}

async function findOwnedDream(userId: string, dreamId: string): Promise<DreamSelectRow> {
  const [dream] = await db
    .select(dreamSelectFields())
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
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        throw new NotFoundError('Kullanici bulunamadi.');
      }

      const [interpreter] = await tx
        .select()
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
        .returning();

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
        createdAt: createdDream.createdAt,
        updatedAt: createdDream.updatedAt,
        interpreterId: interpreter.id,
        interpreterName: interpreter.name,
        interpreterDescription: interpreter.description,
        interpreterImageUrl: interpreter.imageUrl,
        interpreterIsPremium: interpreter.isPremium,
        interpreterSortOrder: interpreter.sortOrder,
      };
    });

    scheduleDreamProcessing(dream.id);

    return serializeDream(dream);
  },

  async getDreamById(userId: string, dreamId: string): Promise<DreamResponse> {
    return serializeDream(await findOwnedDream(userId, dreamId));
  },

  async listDreams(userId: string, query: ListDreamsQuery): Promise<DreamResponse[]> {
    const rows = await db
      .select(dreamSelectFields())
      .from(dreams)
      .innerJoin(interpreters, eq(dreams.interpreterId, interpreters.id))
      .where(eq(dreams.userId, userId))
      .orderBy(desc(dreams.createdAt))
      .limit(query.limit);

    return rows.map(serializeDream);
  },

  async submitFeedback(userId: string, dreamId: string, input: SubmitDreamFeedbackInput): Promise<DreamResponse> {
    const dream = await findOwnedDream(userId, dreamId);

    if (dream.status !== DREAM_STATUS.COMPLETED) {
      throw new ForbiddenError('Sadece tamamlanmis ruyalar icin geri bildirim verilebilir.');
    }

    const [updatedDream] = await db
      .update(dreams)
      .set({
        userRating: input.rating,
        userFeedbackText: input.feedback_text ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(dreams.id, dreamId), eq(dreams.userId, userId)))
      .returning();

    if (!updatedDream) {
      throw new ValidationError('Geri bildirim kaydedilemedi.');
    }

    return serializeDream({
      ...dream,
      userRating: updatedDream.userRating,
      userFeedbackText: updatedDream.userFeedbackText,
      updatedAt: updatedDream.updatedAt,
    });
  },
};
