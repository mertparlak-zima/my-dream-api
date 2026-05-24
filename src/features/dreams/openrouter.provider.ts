import { z } from 'zod';
import { DREAM_PROCESSING_CONFIG, OPENROUTER_API_KEY, RETRY_CONFIG } from '../../config';
import { ExternalServiceError } from '../../errors/ExternalServiceError';
import { addSentryBreadcrumb } from '../../utils/sentry';
import type {
  DreamInterpretationProvider,
  DreamInterpretationRequest,
  DreamInterpretationResult,
} from './dreams.provider';

type FetchLike = typeof fetch;

type OpenRouterDreamProviderOptions = {
  apiKey?: string;
  chatCompletionsUrl?: string;
  fetchImpl?: FetchLike;
  maxTokens?: number;
  retryBackoffBaseMs?: number;
  retryCount?: number;
  sleep?: (ms: number) => Promise<void>;
  temperature?: number;
  timeoutMs?: number;
};

const OpenRouterErrorResponseSchema = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
  }).optional(),
});

const OpenRouterChatCompletionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
    }).optional(),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
  error: z.object({
    code: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
  }).optional(),
});

function buildDreamUserPrompt(content: string, interpreterName: string): string {
  return [
    `Yorumcu: ${interpreterName}`,
    '',
    'Aşağıdaki rüyayı kullanıcıya yardımcı, yargılayıcı olmayan, sembol ve duygu odaklı bir dille yorumla.',
    'Tıbbi tanı, kesin kehanet veya korkutucu iddia üretme. Kısa bir ana tema, sembol okuması ve uygulanabilir küçük bir içgörü ver.',
    '',
    'Rüya:',
    content,
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return RETRY_CONFIG.STATUS_CODES.includes(status as (typeof RETRY_CONFIG.STATUS_CODES)[number]);
}

function getRetryAfterMs(response: Response): number | undefined {
  const retryAfter = response.headers.get('Retry-After');

  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const date = Date.parse(retryAfter);
  if (Number.isFinite(date)) {
    return Math.max(date - Date.now(), 0);
  }

  return undefined;
}

function buildProviderError(status: number, message?: string): ExternalServiceError {
  const normalizedMessage = message?.trim();

  if (status === 401) {
    return new ExternalServiceError('AI provider credentials are invalid.');
  }

  if (status === 402) {
    return new ExternalServiceError('AI provider billing is unavailable.');
  }

  if (status === 429) {
    return new ExternalServiceError('AI provider rate limit exceeded.');
  }

  if (status === 408) {
    return new ExternalServiceError('AI provider request timed out.');
  }

  if (status >= 500) {
    return new ExternalServiceError('AI provider is temporarily unavailable.');
  }

  return new ExternalServiceError(normalizedMessage || 'AI provider request failed.');
}

async function readProviderError(response: Response): Promise<ExternalServiceError> {
  try {
    const parsed = OpenRouterErrorResponseSchema.safeParse(await response.json());
    return buildProviderError(response.status, parsed.success ? parsed.data.error?.message : undefined);
  } catch {
    return buildProviderError(response.status);
  }
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

export class OpenRouterDreamInterpretationProvider implements DreamInterpretationProvider {
  private readonly apiKey: string | undefined;

  private readonly chatCompletionsUrl: string;

  private readonly fetchImpl: FetchLike;

  private readonly maxTokens: number;

  private readonly retryBackoffBaseMs: number;

  private readonly retryCount: number;

  private readonly sleep: (ms: number) => Promise<void>;

  private readonly temperature: number;

  private readonly timeoutMs: number;

  constructor(options: OpenRouterDreamProviderOptions = {}) {
    this.apiKey = options.apiKey ?? OPENROUTER_API_KEY;
    this.chatCompletionsUrl = options.chatCompletionsUrl
      ?? DREAM_PROCESSING_CONFIG.OPENROUTER_CHAT_COMPLETIONS_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxTokens = options.maxTokens ?? DREAM_PROCESSING_CONFIG.OPENROUTER_MAX_TOKENS;
    this.retryBackoffBaseMs = options.retryBackoffBaseMs ?? RETRY_CONFIG.BACKOFF_BASE;
    this.retryCount = options.retryCount ?? RETRY_CONFIG.MAX_COUNT;
    this.sleep = options.sleep ?? sleep;
    this.temperature = options.temperature ?? DREAM_PROCESSING_CONFIG.OPENROUTER_TEMPERATURE;
    this.timeoutMs = options.timeoutMs ?? DREAM_PROCESSING_CONFIG.PROVIDER_TIMEOUT_MS;
  }

  async interpret(request: DreamInterpretationRequest): Promise<DreamInterpretationResult> {
    if (!this.apiKey) {
      throw new ExternalServiceError('AI provider API key is not configured.');
    }

    const response = await this.requestWithRetry(request);
    const parsed = OpenRouterChatCompletionSchema.safeParse(response);

    if (!parsed.success) {
      throw new ExternalServiceError('AI provider returned an invalid response.');
    }

    if (parsed.data.error) {
      throw new ExternalServiceError(parsed.data.error.message ?? 'AI provider returned an error.');
    }

    const interpretation = parsed.data.choices[0]?.message?.content?.trim();

    if (!interpretation) {
      throw new ExternalServiceError('AI provider returned an empty interpretation.');
    }

    return { interpretation };
  }

  private async requestWithRetry(request: DreamInterpretationRequest): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.retryCount; attempt += 1) {
      try {
        const response = await this.sendRequest(request);

        if (!response.ok) {
          const providerError = await readProviderError(response);

          if (isRetryableStatus(response.status) && attempt < this.retryCount - 1) {
            addSentryBreadcrumb('dream.provider', 'OpenRouter retry scheduled', {
              attempt: attempt + 1,
              dreamId: request.dreamId,
              modelId: request.model.openrouterModelId,
              status: response.status,
            }, 'warning');
            await this.sleep(getRetryAfterMs(response) ?? this.retryBackoffBaseMs * 2 ** attempt);
            continue;
          }

          addSentryBreadcrumb('dream.provider', 'OpenRouter request failed', {
            attempt: attempt + 1,
            dreamId: request.dreamId,
            modelId: request.model.openrouterModelId,
            status: response.status,
          }, 'error');
          throw providerError;
        }

        return response.json();
      } catch (error) {
        lastError = error;

        if (error instanceof ExternalServiceError || attempt >= this.retryCount - 1) {
          break;
        }

        addSentryBreadcrumb('dream.provider', 'OpenRouter request error retry scheduled', {
          attempt: attempt + 1,
          dreamId: request.dreamId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          modelId: request.model.openrouterModelId,
        }, 'warning');
        await this.sleep(this.retryBackoffBaseMs * 2 ** attempt);
      }
    }

    if (lastError instanceof ExternalServiceError) {
      throw lastError;
    }

    throw new ExternalServiceError('AI provider request failed.');
  }

  private async sendRequest(request: DreamInterpretationRequest): Promise<Response> {
    const timeout = createTimeoutSignal(this.timeoutMs);

    try {
      return await this.fetchImpl(this.chatCompletionsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-OpenRouter-Title': 'My Dream API',
        },
        body: JSON.stringify({
          model: request.model.openrouterModelId,
          messages: [
            { role: 'system', content: request.interpreter.systemPrompt },
            { role: 'user', content: buildDreamUserPrompt(request.content, request.interpreter.name) },
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          user: request.userId,
        }),
        signal: timeout.signal,
      });
    } finally {
      timeout.clear();
    }
  }
}
