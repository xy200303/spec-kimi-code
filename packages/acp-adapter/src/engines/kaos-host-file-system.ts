/**
 * Session-local v2 filesystem adapter for the v1-compatible Kaos boundary.
 *
 * Text and byte content operations use Kaos, so an AcpKaos can forward them
 * through ACP reverse RPC. Structural and destructive operations stay on the
 * kap-server host backend because ACP only exposes readTextFile/writeTextFile.
 */

import type { Kaos } from '@moonshot-ai/kaos';
import type { IHostFileSystem } from '@moonshot-ai/agent-core-v2';

export class KaosHostFileSystem implements IHostFileSystem {
  declare readonly _serviceBrand: undefined;

  constructor(
    private readonly kaos: Kaos,
    private readonly fallback: IHostFileSystem,
  ) {}

  readText(
    path: string,
    options?: { encoding?: BufferEncoding; errors?: 'strict' | 'replace' | 'ignore' },
  ): Promise<string> {
    return this.kaos.readText(path, options);
  }

  async writeText(path: string, data: string): Promise<void> {
    await this.kaos.writeText(path, data);
  }

  async appendText(path: string, data: string): Promise<void> {
    await this.kaos.writeText(path, data, { mode: 'a' });
  }

  readBytes(path: string, n?: number): Promise<Uint8Array> {
    return this.kaos.readBytes(path, n);
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    await this.kaos.writeBytes(path, buffer);
  }

  readLines(
    path: string,
    options?: { encoding?: BufferEncoding; errors?: 'strict' | 'replace' | 'ignore' },
  ): AsyncGenerator<string> {
    return this.kaos.readLines(path, options);
  }

  createExclusive(path: string, data: Uint8Array): Promise<boolean> {
    return this.fallback.createExclusive(path, data);
  }

  stat(path: string): ReturnType<IHostFileSystem['stat']> {
    return this.fallback.stat(path);
  }

  readdir(path: string): ReturnType<IHostFileSystem['readdir']> {
    return this.fallback.readdir(path);
  }

  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    return this.fallback.mkdir(path, options);
  }

  remove(path: string): Promise<void> {
    return this.fallback.remove(path);
  }
}
