/**
 * Covers: GenerateImageTool.
 *
 * Uses a fake ImageGenerationProvider and stubs global fetch so the tool's
 * download path can be exercised without network access.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GenerateImageInputSchema,
  GenerateImageTool,
  type GeneratedImage,
  type ImageGenerationProvider,
} from '../../src/tools/builtin/image/generate-image';
import {
  createFakeKaos,
  PERMISSIVE_WORKSPACE,
  toolContentString,
} from './fixtures/fake-kaos';
import { executeTool } from './fixtures/execute-tool';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const signal = new AbortController().signal;

function fakeProvider(images: GeneratedImage[] = []): ImageGenerationProvider {
  return { generate: vi.fn().mockResolvedValue(images) };
}

function fakeImageResponse(data: Buffer): Response {
  return new Response(data, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

function createRecordingKaos() {
  const written: { path: string; data: Buffer }[] = [];
  const kaos = createFakeKaos({
    stat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeBytes: vi.fn(async (path: string, data: Buffer) => {
      written.push({ path, data });
      return data.length;
    }),
  });
  return { kaos, written };
}

describe('GenerateImageTool', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has name "GenerateImage" and a non-empty description', () => {
    const tool = new GenerateImageTool(createFakeKaos(), PERMISSIVE_WORKSPACE, fakeProvider());
    expect(tool.name).toBe('GenerateImage');
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it('parameters expose the expected fields', () => {
    const tool = new GenerateImageTool(createFakeKaos(), PERMISSIVE_WORKSPACE, fakeProvider());
    const properties = (tool.parameters as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties)).toEqual([
      'prompt',
      'output_path',
      'model',
      'size',
      'quality',
      'style',
      'n',
    ]);
  });

  it('validates required fields through the input schema', () => {
    expect(GenerateImageInputSchema.safeParse({ prompt: 'x', output_path: 'out.png' }).success).toBe(
      true,
    );
    expect(GenerateImageInputSchema.safeParse({ output_path: 'out.png' }).success).toBe(false);
    expect(GenerateImageInputSchema.safeParse({ prompt: '', output_path: 'out.png' }).success).toBe(
      false,
    );
  });

  it('generates a single image and saves it to the requested path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(fakeImageResponse(PNG_HEADER)),
    );
    const provider = fakeProvider([{ url: 'https://cdn.example/image.png' }]);
    const { kaos, written } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c1',
      args: { prompt: 'a red apple', output_path: '/workspace/apple.png' },
      signal,
    });

    expect(result.isError).toBe(false);
    const content = toolContentString(result);
    expect(content).toContain('/workspace/apple.png');
    expect(written).toHaveLength(1);
    expect(written[0]?.path).toBe('/workspace/apple.png');
    expect(written[0]?.data.subarray(0, PNG_HEADER.length)).toEqual(PNG_HEADER);
    expect(provider.generate).toHaveBeenCalledWith('a red apple', {
      toolCallId: 'c1',
    });
  });

  it('appends an extension when output_path has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(fakeImageResponse(PNG_HEADER)),
    );
    const provider = fakeProvider([{ url: 'https://cdn.example/image.png' }]);
    const { kaos, written } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c2',
      args: { prompt: 'a red apple', output_path: '/workspace/apple' },
      signal,
    });

    expect(result.isError).toBe(false);
    expect(toolContentString(result)).toContain('/workspace/apple.png');
    expect(written[0]?.path).toBe('/workspace/apple.png');
  });

  it('generates multiple images with indexed file names when n > 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(fakeImageResponse(PNG_HEADER))),
    );
    const provider = fakeProvider([
      { url: 'https://cdn.example/one.png' },
      { url: 'https://cdn.example/two.png' },
    ]);
    const { kaos, written } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c3',
      args: { prompt: 'two apples', output_path: '/workspace/apple.png', n: 2 },
      signal,
    });

    expect(result.isError).toBe(false);
    const content = toolContentString(result);
    expect(content).toContain('/workspace/apple_0.png');
    expect(content).toContain('/workspace/apple_1.png');
    expect(written).toHaveLength(2);
    expect(written[0]?.path).toBe('/workspace/apple_0.png');
    expect(written[1]?.path).toBe('/workspace/apple_1.png');
    expect(provider.generate).toHaveBeenCalledWith(
      'two apples',
      expect.objectContaining({ n: 2 }),
    );
  });

  it('returns an error when the provider returns no images', async () => {
    const provider = fakeProvider([]);
    const { kaos } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c4',
      args: { prompt: 'nothing', output_path: '/workspace/nothing.png' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(toolContentString(result)).toContain('returned no images');
  });

  it('returns a path-security error for workspace-escaping relative paths', async () => {
    const tool = new GenerateImageTool(
      createFakeKaos(),
      { workspaceDir: '/workspace', additionalDirs: [] },
      fakeProvider(),
    );

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c5',
      args: { prompt: 'escape', output_path: '../escape.png' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(toolContentString(result)).toMatch(/workspace|outside/i);
  });

  it('classifies authentication failures', async () => {
    const provider = fakeProvider();
    provider.generate = vi.fn().mockRejectedValue(
      new Error('Image generation request failed: HTTP 401 (auth/unauthorized).'),
    );
    const { kaos } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c6',
      args: { prompt: 'auth fail', output_path: '/workspace/out.png' },
      signal,
    });

    expect(result.isError).toBe(true);
    const content = toolContentString(result);
    expect(content).toContain('Image generation failed (authentication):');
    expect(content).toContain('HTTP 401');
  });

  it('classifies network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('getaddrinfo ENOENT')),
    );
    const provider = fakeProvider([{ url: 'https://cdn.example/image.png' }]);
    const { kaos } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c7',
      args: { prompt: 'network fail', output_path: '/workspace/out.png' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(toolContentString(result)).toContain('Image generation failed (network):');
  });

  it('classifies download HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('not found', { status: 404 })),
    );
    const provider = fakeProvider([{ url: 'https://cdn.example/image.png' }]);
    const { kaos } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c8',
      args: { prompt: 'download fail', output_path: '/workspace/out.png' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(toolContentString(result)).toContain('HTTP 404');
  });

  it('classifies aborted requests', async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    const provider = fakeProvider();
    provider.generate = vi.fn().mockRejectedValue(err);
    const { kaos } = createRecordingKaos();
    const tool = new GenerateImageTool(kaos, PERMISSIVE_WORKSPACE, provider);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c9',
      args: { prompt: 'abort', output_path: '/workspace/out.png' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(toolContentString(result)).toContain('Image generation cancelled:');
  });

  it('resolveExecution description truncates long prompts', () => {
    const tool = new GenerateImageTool(createFakeKaos(), PERMISSIVE_WORKSPACE, fakeProvider());
    const execution = tool.resolveExecution({
      prompt: 'a'.repeat(60),
      output_path: '/workspace/out.png',
    });
    expect(execution.isError).toBeFalsy();
    if (execution.isError === true) throw new Error('expected runnable execution');
    const desc = execution.description ?? '';
    expect(desc.length).toBeLessThanOrEqual(55);
    expect(desc).toContain('…');
  });
});
