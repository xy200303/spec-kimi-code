/**
 * Scenario: the ACP v2 backend drives a real in-process kap-server.
 *
 * Verifies session creation and discovery through the public engine contract,
 * including ACP session creation with a static API-key provider.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  type AgentSideConnection as AgentSideConnectionType,
  type Client,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from '@agentclientprotocol/sdk';
import { IFileEditService } from '@moonshot-ai/agent-core-v2';
import { LocalKaos } from '@moonshot-ai/kaos';
import { startServer } from '@moonshot-ai/kap-server';

import { AcpKaos } from '../src/kaos-acp';
import { AcpServer } from '../src/server';
import { V2AcpEngine } from '../src/engines/v2';

function makeInMemoryStreamPair(): {
  agentStream: ReturnType<typeof ndJsonStream>;
  clientStream: ReturnType<typeof ndJsonStream>;
} {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  return {
    agentStream: ndJsonStream(agentToClient.writable, clientToAgent.readable),
    clientStream: ndJsonStream(clientToAgent.writable, agentToClient.readable),
  };
}

class NoopAcpClient implements Client {
  async requestPermission(_p: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    throw new Error('requestPermission should not be called in the v2 ACP auth smoke test');
  }

  async sessionUpdate(_n: SessionNotification): Promise<void> {}

  async writeTextFile(_p: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    return {};
  }

  async readTextFile(_p: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    return { content: '' };
  }
}

describe('V2AcpEngine smoke', () => {
  it('creates a session against an in-process kap-server', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-smoke-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
    });
    try {
      const status = await engine.auth.status();
      expect(Array.isArray(status.providers)).toBe(true);

      const session = await engine.createSession({ id: 'sess-smoke-1', workDir: home });
      expect(session.id).toBe('sess-smoke-1');

      const summaries = await engine.listSessions({ workDir: home });
      expect(summaries.some((s) => s.id === 'sess-smoke-1')).toBe(true);

    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('leaves plan mode when it is disabled', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-plan-mode-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
    });

    try {
      const session = await engine.createSession({ id: 'sess-plan-mode', workDir: home });

      await session.setPlanMode(true);
      await expect(session.getStatus()).resolves.toMatchObject({ planMode: true });

      await session.setPlanMode(false);
      await expect(session.getStatus()).resolves.toMatchObject({ planMode: false });
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('preserves configured model aliases in the ACP model catalog', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-models-'));
    await writeFile(
      join(home, 'config.toml'),
      [
        'default_model = "friendly-model"',
        '',
        '[providers.example]',
        'type = "openai"',
        'base_url = "https://example.test/v1"',
        'api_key = "YOUR_API_KEY"',
        '',
        '[models.friendly-model]',
        'provider = "example"',
        'model = "provider-model-id"',
        'max_context_size = 128000',
        'capabilities = ["thinking"]',
        'display_name = "Friendly Model"',
      ].join('\n'),
    );
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
    });

    try {
      const models = await engine.listModels();
      const status = await engine.auth.status();

      expect(models['friendly-model']).toMatchObject({
        model: 'friendly-model',
        displayName: 'Friendly Model',
        capabilities: ['thinking'],
      });
      expect(status.providers).toContainEqual({ hasToken: true });
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('preserves the ACP filesystem bridge when reloading an open v2 session', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-reload-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const readTextFile = vi.fn(() => Promise.resolve({ content: 'before reload' }));
    const writeTextFile = vi.fn(() => Promise.resolve({}));
    const conn = { readTextFile, writeTextFile } as unknown as AgentSideConnectionType;
    const kaos = new AcpKaos(conn, 'sess-reload', await LocalKaos.create());
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
      embeddedHost: server.embeddedSessionHost,
    });

    try {
      const session = await engine.createSession({ id: 'sess-reload', workDir: home, kaos });

      const summary = await session.reloadSession();
      const handle = server.embeddedSessionHost.lifecycle.get(session.id);
      const edit = await handle?.accessor.get(IFileEditService).edit({
        path: join(home, 'reload.ts'),
        displayPath: 'reload.ts',
        old_string: 'before',
        new_string: 'after',
        replace_all: false,
      });

      expect(summary).toMatchObject({ id: 'sess-reload', workDir: home });
      expect(edit).toEqual({ ok: true, count: 1 });
      expect(writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'after reload', sessionId: 'sess-reload' }),
      );
      await expect(session.getStatus()).resolves.toMatchObject({
        permission: 'manual',
      });
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('binds the ACP filesystem bridge when resuming a closed v2 session', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-resume-fs-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const readTextFile = vi.fn(() => Promise.resolve({ content: 'before resume' }));
    const writeTextFile = vi.fn(() => Promise.resolve({}));
    const conn = { readTextFile, writeTextFile } as unknown as AgentSideConnectionType;
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
      embeddedHost: server.embeddedSessionHost,
    });

    try {
      const created = await engine.createSession({ id: 'sess-resume-fs', workDir: home });
      await created.close();
      const kaos = new AcpKaos(conn, created.id, await LocalKaos.create());

      const resumed = await engine.resumeSession({ id: created.id, kaos });
      const handle = server.embeddedSessionHost.lifecycle.get(resumed.id);
      const edit = await handle?.accessor.get(IFileEditService).edit({
        path: join(home, 'resume.ts'),
        displayPath: 'resume.ts',
        old_string: 'before',
        new_string: 'after',
        replace_all: false,
      });

      expect(edit).toEqual({ ok: true, count: 1 });
      expect(writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'after resume', sessionId: created.id }),
      );
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('routes a session-scoped v2 edit through the ACP Kaos bridge', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-acp-fs-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const readTextFile = vi.fn(() => Promise.resolve({ content: 'UNSAVED V2 CONTENT' }));
    const writeTextFile = vi.fn(() => Promise.resolve({}));
    const conn = { readTextFile, writeTextFile } as unknown as AgentSideConnectionType;
    const inner = await LocalKaos.create();
    const kaos = new AcpKaos(conn, 'sess-acp-fs', inner);
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
      embeddedHost: server.embeddedSessionHost,
    });

    try {
      const session = await engine.createSession({
        id: 'sess-acp-fs',
        workDir: home,
        kaos,
      });
      const handle = server.embeddedSessionHost.lifecycle.get(session.id);

      await expect(
        handle?.accessor.get(IFileEditService).edit({
          path: join(home, 'unsaved.ts'),
          displayPath: 'unsaved.ts',
          old_string: 'V2',
          new_string: 'ACP V2',
          replace_all: false,
        }),
      ).resolves.toEqual({ ok: true, count: 1 });
      expect(readTextFile).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sess-acp-fs' }),
      );
      expect(writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-acp-fs',
          content: 'UNSAVED ACP V2 CONTENT',
        }),
      );
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('creates an ACP session when the v2 provider has a static API key', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-acp-auth-'));
    await writeFile(
      join(home, 'config.toml'),
      [
        'default_model = "friendly-model"',
        '',
        '[providers.example]',
        'type = "openai"',
        'base_url = "https://example.test/v1"',
        'api_key = "YOUR_API_KEY"',
        '',
        '[models.friendly-model]',
        'provider = "example"',
        'model = "provider-model-id"',
      ].join('\n'),
    );
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
      embeddedHost: server.embeddedSessionHost,
    });
    const { agentStream, clientStream } = makeInMemoryStreamPair();
    void new AgentSideConnection((connection) => new AcpServer(engine, connection), agentStream);
    const client = new ClientSideConnection(() => new NoopAcpClient(), clientStream);

    try {
      await client.initialize({
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      });
      const response = await client.newSession({ cwd: home, mcpServers: [] });

      expect(response.sessionId).toMatch(/^session_/);
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);
});
