/**
 * OpenAIImageGenerationProvider — host-injected image generator.
 *
 * Calls an OpenAI-compatible `/images/generations` endpoint and returns
 * the generated image URLs. Auth uses a narrow bearer token provider per
 * request, with a static API key fallback, matching the other Moonshot
 * service providers.
 */

import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationProvider,
} from '../builtin/image/generate-image';

export interface BearerTokenProvider {
  getAccessToken(options?: { readonly force?: boolean | undefined }): Promise<string>;
}

export interface OpenAIImageGenerationProviderOptions {
  tokenProvider?: BearerTokenProvider;
  apiKey?: string;
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  customHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

interface OpenAIImageGenerationResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
}

const DEFAULT_MODEL = 'dall-e-3';

export class OpenAIImageGenerationProvider implements ImageGenerationProvider {
  private readonly tokenProvider: BearerTokenProvider | undefined;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly customHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIImageGenerationProviderOptions) {
    this.tokenProvider = options.tokenProvider;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.customHeaders = options.customHeaders ?? {};
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async generate(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage[]> {
    const body = this.buildRequestBody(prompt, options);
    const response = await this.post(JSON.stringify(body), options.toolCallId);

    if (response.status === 401) {
      const detail = await safeReadText(response);
      throw new Error(
        `Image generation request failed: HTTP 401 (auth/unauthorized). ${detail}`.trim(),
      );
    }

    if (!response.ok) {
      const detail = await safeReadText(response);
      throw new Error(
        `Image generation request failed: HTTP ${String(response.status)}. ${detail}`.trim(),
      );
    }

    const json = (await response.json()) as OpenAIImageGenerationResponse;
    const raw = Array.isArray(json.data) ? json.data : [];
    const images: GeneratedImage[] = [];
    for (const item of raw) {
      const url = typeof item.url === 'string' ? item.url : undefined;
      if (url !== undefined) {
        images.push({ url });
      }
    }
    return images;
  }

  private buildRequestBody(
    prompt: string,
    options: ImageGenerationOptions,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model ?? DEFAULT_MODEL,
      prompt,
      response_format: 'url',
    };
    if (options.n !== undefined && options.n > 0) {
      body['n'] = options.n;
    }
    if (options.size !== undefined && options.size.length > 0) {
      body['size'] = options.size;
    }
    if (options.quality !== undefined && options.quality.length > 0) {
      body['quality'] = options.quality;
    }
    if (options.style !== undefined && options.style.length > 0) {
      body['style'] = options.style;
    }
    return body;
  }

  private async post(bodyJson: string, toolCallId: string | undefined): Promise<Response> {
    const accessToken = await this.resolveApiKey();
    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/images/generations`;
    return this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(toolCallId !== undefined && toolCallId.length > 0
          ? { 'X-Msh-Tool-Call-Id': toolCallId }
          : {}),
        ...this.customHeaders,
      },
      body: bodyJson,
    });
  }

  private async resolveApiKey(): Promise<string> {
    if (this.tokenProvider !== undefined) {
      try {
        const token = await this.tokenProvider.getAccessToken();
        if (token.trim().length > 0) {
          return token;
        }
        if (this.apiKey !== undefined && this.apiKey.length > 0) {
          return this.apiKey;
        }
      } catch (error) {
        if (this.apiKey !== undefined && this.apiKey.length > 0) {
          return this.apiKey;
        }
        throw error;
      }
    }
    if (this.apiKey !== undefined && this.apiKey.length > 0) {
      return this.apiKey;
    }
    throw new Error(
      'Image generation service is not configured: missing API key or token provider.',
    );
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
