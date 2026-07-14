/**
 * GenerateImageTool — generate images via a host-injected image generation
 * provider and save them to disk.
 *
 * The tool is only registered when a provider is supplied, so it is not
 * exposed to the model unless the host has configured an image generation
 * service.
 */

import { dirname } from 'pathe';
import { z } from 'zod';

import type { Kaos } from '@moonshot-ai/kaos';

import type { BuiltinTool } from '../../../agent/tool';
import { ToolAccesses } from '../../../loop/tool-access';
import type {
  ExecutableToolContext,
  ExecutableToolResult,
  ToolExecution,
} from '../../../loop/types';
import { resolvePathAccessPath } from '../../policies/path-access';
import { sniffMediaFromMagic } from '../../support/file-type';
import { toInputJsonSchema } from '../../support/input-schema';
import { ToolResultBuilder } from '../../support/result-builder';
import { literalRulePattern, matchesPathRuleSubject } from '../../support/rule-match';
import type { WorkspaceConfig } from '../../support/workspace';
import DESCRIPTION from './generate-image.md?raw';

// ── Provider interface (host-injected) ───────────────────────────────

export interface GeneratedImage {
  /** Publicly accessible URL for the generated image. */
  readonly url: string;
}

export interface ImageGenerationOptions {
  model?: string;
  size?: string;
  quality?: string;
  style?: string;
  n?: number;
  toolCallId?: string;
}

export interface ImageGenerationProvider {
  generate(prompt: string, options?: ImageGenerationOptions): Promise<GeneratedImage[]>;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'dall-e-3';

/** Max bytes for a single generated image (10 MiB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Maps a sniffed image MIME type to a preferred file extension. */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/x-icon': '.ico',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
});

/** Mask isolating the file-type bits of a stat mode. */
const S_IFMT = 0o170000;
/** File-type bits of a directory. */
const S_IFDIR = 0o040000;

// ── Input schema ─────────────────────────────────────────────────────

export const GenerateImageInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .describe('A detailed text description of the image to generate.'),
  output_path: z
    .string()
    .describe(
      'Path where the generated image will be saved. Relative paths resolve against the working directory; ' +
        'a path outside the working directory must be absolute. Missing parent directories are created automatically. ' +
        'If the path has no file extension, the correct extension is appended from the downloaded image format.',
    ),
  model: z
    .string()
    .optional()
    .describe(`Image generation model identifier. Defaults to "${DEFAULT_MODEL}" if omitted.`),
  size: z
    .string()
    .optional()
    .describe('Desired image size, e.g. "1024x1024". Supported values depend on the model.'),
  quality: z
    .string()
    .optional()
    .describe('Image quality, e.g. "standard" or "hd". Supported values depend on the model.'),
  style: z
    .string()
    .optional()
    .describe('Image style, e.g. "vivid" or "natural". Supported values depend on the model.'),
  n: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Number of images to generate. Defaults to 1. When greater than 1, files are suffixed with _0, _1, etc.'),
});

export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

// ── Implementation ───────────────────────────────────────────────────

export class GenerateImageTool implements BuiltinTool<GenerateImageInput> {
  readonly name = 'GenerateImage' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(GenerateImageInputSchema);

  constructor(
    private readonly kaos: Kaos,
    private readonly workspace: WorkspaceConfig,
    private readonly provider: ImageGenerationProvider,
  ) {}

  resolveExecution(args: GenerateImageInput): ToolExecution {
    const path = resolvePathAccessPath(args.output_path, {
      kaos: this.kaos,
      workspace: this.workspace,
      operation: 'write',
    });
    return {
      accesses: ToolAccesses.writeFile(path),
      description: `Generating image: ${this.preview(args.prompt)}`,
      display: { kind: 'generic', summary: `Generate image: ${this.preview(args.prompt)}` },
      approvalRule: literalRulePattern(this.name, path),
      matchesRule: (ruleArgs) =>
        matchesPathRuleSubject(ruleArgs, path, {
          cwd: this.workspace.workspaceDir,
          pathClass: this.kaos.pathClass(),
          homeDir: this.kaos.gethome(),
        }),
      execute: (ctx) => this.execution(args, path, ctx),
    };
  }

  private preview(prompt: string): string {
    return prompt.length > 35 ? `${prompt.slice(0, 35)}…` : prompt;
  }

  private async execution(
    args: GenerateImageInput,
    safePath: string,
    { toolCallId, signal }: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    const parentError = await this.ensureParentDirectory(safePath);
    if (parentError !== undefined) {
      return { isError: true, output: parentError };
    }

    try {
      signal?.throwIfAborted();

      const images = await this.provider.generate(args.prompt, {
        model: args.model,
        size: args.size,
        quality: args.quality,
        style: args.style,
        n: args.n,
        toolCallId,
      });

      if (images.length === 0) {
        return { isError: true, output: 'Image generation service returned no images.' };
      }

      const targetCount = args.n ?? 1;
      const paths = await this.downloadImages(images, safePath, targetCount, signal);

      const builder = new ToolResultBuilder({ maxLineLength: null });
      builder.write(`Generated ${String(paths.length)} image${paths.length === 1 ? '' : 's'}:\n`);
      for (const p of paths) {
        builder.write(`- ${p}\n`);
      }
      return builder.ok();
    } catch (error) {
      return { isError: true, output: classifyGenerateImageError(error) };
    }
  }

  private async downloadImages(
    images: GeneratedImage[],
    safePath: string,
    targetCount: number,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const paths: string[] = [];
    for (let i = 0; i < images.length; i += 1) {
      const imagePath = targetCount > 1 ? this.suffixedPath(safePath, i) : safePath;
      const data = await this.downloadImage(images[i]!.url, signal);
      const ext = this.inferExtension(data, imagePath);
      const finalPath = ext !== '' && !this.hasExtension(imagePath) ? `${imagePath}${ext}` : imagePath;
      await this.ensureParentDirectory(finalPath);
      await this.kaos.writeBytes(finalPath, data);
      // Report the user-provided path when possible; when we added an
      // extension, still return the final written path so it is unambiguous.
      paths.push(finalPath);
    }
    return paths;
  }

  private async downloadImage(url: string, signal?: AbortSignal): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      throw new Error(`Failed to download generated image from ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      throw new Error(`Failed to download generated image from ${url}: HTTP ${String(response.status)}.`);
    }
    const contentLengthRaw = response.headers.get('content-length');
    if (contentLengthRaw !== null) {
      const contentLength = Number(contentLengthRaw);
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new Error(
          `Generated image is too large: ${String(contentLength)} bytes exceeds the maximum ${String(MAX_IMAGE_BYTES)} bytes.`,
        );
      }
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(
        `Generated image is too large: ${String(buffer.length)} bytes exceeds the maximum ${String(MAX_IMAGE_BYTES)} bytes.`,
      );
    }
    return buffer;
  }

  private suffixedPath(path: string, index: number): string {
    const match = /\.[^.\/\\]+$/.exec(path);
    if (match === null) {
      return `${path}_${String(index)}`;
    }
    const stem = path.slice(0, match.index);
    const ext = match[0];
    return `${stem}_${String(index)}${ext}`;
  }

  private hasExtension(path: string): boolean {
    return /\.[^.\/\\]+$/.test(path);
  }

  private inferExtension(data: Buffer, fallbackPath: string): string {
    const sniffed = sniffMediaFromMagic(data);
    if (sniffed !== null) {
      const ext = EXTENSION_BY_MIME[sniffed.mimeType];
      if (ext !== undefined) return ext;
    }
    // Fall back to any extension already present on the path.
    const match = /\.[^.\/\\]+$/.exec(fallbackPath);
    return match?.[0] ?? '.png';
  }

  /**
   * Best-effort check that the parent directory is usable, creating it when
   * it is missing. Mirrors the behaviour of WriteTool.
   */
  private async ensureParentDirectory(safePath: string): Promise<string | undefined> {
    const parent = dirname(safePath);
    let stat;
    try {
      stat = await this.kaos.stat(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
          await this.kaos.mkdir(parent, { parents: true, existOk: true });
          return undefined;
        } catch (mkdirError) {
          return mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
        }
      }
      return undefined;
    }
    if ((stat.stMode & S_IFMT) !== S_IFDIR) {
      return `Parent path is not a directory: ${parent}.`;
    }
    return undefined;
  }
}

// ── Error classification ─────────────────────────────────────────────

/**
 * Maps a thrown image-generation error to a categorised, human-readable
 * message. The original error text is preserved so the model can still see
 * the underlying detail.
 */
function classifyGenerateImageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (name === 'AbortError' || lower.includes('abort')) {
    return `Image generation cancelled: ${message}`;
  }
  if (name === 'TimeoutError' || lower.includes('timed out') || lower.includes('timeout')) {
    return `Image generation timed out: ${message}`;
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('auth')) {
    return `Image generation failed (authentication): ${message}`;
  }
  if (
    lower.includes('http ') ||
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('download') ||
    name === 'TypeError'
  ) {
    return `Image generation failed (network): ${message}`;
  }
  return `Image generation failed: ${message}`;
}
