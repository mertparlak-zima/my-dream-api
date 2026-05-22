import { ExternalServiceError } from '../../src/errors/ExternalServiceError';
import { DEFAULT_SEED_OPENROUTER_MODEL_ID } from '../../src/db/seed.policy';
import { OpenRouterDreamInterpretationProvider } from '../../src/features/dreams/openrouter.provider';

function createRequest() {
  return {
    dreamId: 'dream-id',
    userId: 'user-id',
    content: 'vitest: dream content',
    interpreter: {
      id: 'interpreter-id',
      name: 'vitest interpreter',
      systemPrompt: 'vitest system prompt',
    },
    model: {
      openrouterModelId: DEFAULT_SEED_OPENROUTER_MODEL_ID,
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...init.headers },
    status: init.status ?? 200,
  });
}

describe('OpenRouterDreamInterpretationProvider', () => {
  it('sends a chat completion request with interpreter prompt, model id, and user id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      choices: [
        {
          message: { content: ' vitest: interpreted dream ' },
          finish_reason: 'stop',
        },
      ],
    }));
    const provider = new OpenRouterDreamInterpretationProvider({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      retryCount: 1,
      timeoutMs: 1000,
    });

    const result = await provider.interpret(createRequest());

    expect(result).toEqual({ interpretation: 'vitest: interpreted dream' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'My Dream API',
      },
    });

    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: DEFAULT_SEED_OPENROUTER_MODEL_ID,
      max_tokens: expect.any(Number),
      temperature: expect.any(Number),
      user: 'user-id',
      messages: [
        { role: 'system', content: 'vitest system prompt' },
        { role: 'user', content: expect.stringContaining('vitest: dream content') },
      ],
    });
  });

  it('retries transient provider responses and honors Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(
        { error: { code: 429, message: 'rate limited' } },
        { status: 429, headers: { 'Retry-After': '1' } },
      ))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: 'vitest: recovered' } }],
      }));
    const sleepMock = vi.fn(async () => undefined);
    const provider = new OpenRouterDreamInterpretationProvider({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      retryCount: 2,
      sleep: sleepMock,
      timeoutMs: 1000,
    });

    await expect(provider.interpret(createRequest())).resolves.toEqual({
      interpretation: 'vitest: recovered',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(1000);
  });

  it('maps non-retryable provider responses to ExternalServiceError', async () => {
    const provider = new OpenRouterDreamInterpretationProvider({
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => jsonResponse(
        { error: { code: 401, message: 'invalid key' } },
        { status: 401 },
      )),
      retryCount: 2,
      sleep: vi.fn(async () => undefined),
      timeoutMs: 1000,
    });

    await expect(provider.interpret(createRequest())).rejects.toThrow(ExternalServiceError);
  });

  it('rejects empty or invalid provider content', async () => {
    const provider = new OpenRouterDreamInterpretationProvider({
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => jsonResponse({
        choices: [{ message: { content: '   ' } }],
      })),
      retryCount: 1,
      timeoutMs: 1000,
    });

    await expect(provider.interpret(createRequest())).rejects.toThrow(ExternalServiceError);
  });
});
