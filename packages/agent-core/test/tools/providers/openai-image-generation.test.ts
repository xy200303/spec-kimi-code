import { describe, expect, it, vi } from 'vitest';

import { OpenAIImageGenerationProvider } from '../../../src/tools/providers/openai-image-generation';

describe('OpenAIImageGenerationProvider', () => {
  it('posts an OpenAI-compatible images/generations request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ url: 'https://cdn.example/image.png' }],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAIImageGenerationProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      fetchImpl,
    });

    const images = await provider.generate('a red apple');

    expect(images).toEqual([{ url: 'https://cdn.example/image.png' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchImpl.mock.calls[0]!;
    expect(endpoint).toBe('https://api.openai.com/v1/images/generations');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer sk-test');
    expect((init?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({
      model: 'dall-e-3',
      prompt: 'a red apple',
      response_format: 'url',
    });
  });

  it('forwards optional generation parameters', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/image.png' }] }), {
        status: 200,
      }),
    );
    const provider = new OpenAIImageGenerationProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1/',
      fetchImpl,
    });

    await provider.generate('a cat', {
      model: 'dall-e-3',
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid',
      n: 2,
      toolCallId: 'tc-1',
    });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({
      model: 'dall-e-3',
      prompt: 'a cat',
      response_format: 'url',
      n: 2,
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid',
    });
    expect((init?.headers as Record<string, string>)?.['X-Msh-Tool-Call-Id']).toBe('tc-1');
  });

  it('falls back to the configured API key when the token provider returns empty', async () => {
    const getAccessToken = vi.fn<() => Promise<string>>().mockResolvedValue('');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/image.png' }] }), {
        status: 200,
      }),
    );
    const provider = new OpenAIImageGenerationProvider({
      tokenProvider: { getAccessToken },
      apiKey: 'fallback-key',
      baseUrl: 'https://api.example.com/v1',
      fetchImpl,
    });

    await provider.generate('a dog');

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)?.['Authorization']).toBe(
      'Bearer fallback-key',
    );
  });

  it('falls back to the configured API key when the token provider throws', async () => {
    const getAccessToken = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('revoked'));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/image.png' }] }), {
        status: 200,
      }),
    );
    const provider = new OpenAIImageGenerationProvider({
      tokenProvider: { getAccessToken },
      apiKey: 'fallback-key',
      baseUrl: 'https://api.example.com/v1',
      fetchImpl,
    });

    await provider.generate('a tree');

    const init = fetchImpl.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)?.['Authorization']).toBe(
      'Bearer fallback-key',
    );
  });

  it('throws a clear error when no credentials are configured', async () => {
    const provider = new OpenAIImageGenerationProvider({
      baseUrl: 'https://api.example.com/v1',
    });

    await expect(provider.generate('anything')).rejects.toThrow(
      /missing API key or token provider/,
    );
  });

  it('throws an authentication-flavoured error on HTTP 401', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    );
    const provider = new OpenAIImageGenerationProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      fetchImpl,
    });

    await expect(provider.generate('a moon')).rejects.toThrow(/HTTP 401 \(auth\/unauthorized\)/);
  });

  it('throws with status detail on other non-2xx responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const provider = new OpenAIImageGenerationProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      fetchImpl,
    });

    await expect(provider.generate('a star')).rejects.toThrow(/HTTP 429/);
  });

  it('ignores response entries without a URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ url: 'https://cdn.example/one.png' }, { b64_json: 'abc' }, {}],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAIImageGenerationProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      fetchImpl,
    });

    const images = await provider.generate('three things');

    expect(images).toEqual([{ url: 'https://cdn.example/one.png' }]);
  });
});
