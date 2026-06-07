import { eq } from 'drizzle-orm';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_TEXT_SIZE,
  type Language,
  type TextSize,
} from '../../constants/domain';
import { db } from '../../db';
import { userPreferences } from './user_preferences.schema';
import type { UpdatePreferencesInput } from './user_preferences.schemas';

export type PreferencesResponse = {
  text_size: TextSize;
  language: Language;
};

type PreferencesRow = {
  textSize: TextSize;
  language: Language;
};

function serialize(row: PreferencesRow): PreferencesResponse {
  return { text_size: row.textSize, language: row.language };
}

export const userPreferencesService = {
  /** Current preferences; column defaults when the user has no row yet. */
  async getPreferences(userId: string): Promise<PreferencesResponse> {
    const [row] = await db
      .select({ textSize: userPreferences.textSize, language: userPreferences.language })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (!row) {
      return { text_size: DEFAULT_TEXT_SIZE, language: DEFAULT_LANGUAGE };
    }

    return serialize(row);
  },

  /** Upsert the supplied fields; unspecified fields keep their stored/default value. */
  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<PreferencesResponse> {
    const updateSet: { textSize?: TextSize; language?: Language; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (input.text_size !== undefined) {
      updateSet.textSize = input.text_size;
    }

    if (input.language !== undefined) {
      updateSet.language = input.language;
    }

    const [row] = await db
      .insert(userPreferences)
      .values({ userId, textSize: input.text_size, language: input.language })
      .onConflictDoUpdate({ target: userPreferences.userId, set: updateSet })
      .returning({ textSize: userPreferences.textSize, language: userPreferences.language });

    return serialize(row!);
  },
};
