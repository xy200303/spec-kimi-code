/**
 * Scenario: ACP extension requests are dispatched over the protocol surface.
 *
 * Uses in-memory ACP streams and stubs only the engine session boundary.
 */

import { describe, expect, it } from 'vitest';

import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  type Client,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from '@agentclientprotocol/sdk';
import type { KimiHarness, PromptInput, Session } from '@moonshot-ai/kimi-code-sdk';

import { AcpServer } from '../src/server';
import { AUTHED_STATUS } from './_helpers/harness-stubs';

class StubClient implements Client {
  async requestPermission(_p: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    throw new Error('StubClient.requestPermission should not be called in ext-methods test');
  }
  async sessionUpdate(_n: SessionNotification): Promise<void> {
    throw new Error('StubClient.sessionUpdate should not be called in ext-methods test');
  }
  async writeTextFile(_p: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    throw new Error('StubClient.writeTextFile should not be called in ext-methods test');
  }
  async readTextFile(_p: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    throw new Error('StubClient.readTextFile should not be called in ext-methods test');
  }
}

function makeInMemoryStreamPair(): {
  agentStream: ReturnType<typeof ndJsonStream>;
  clientStream: ReturnType<typeof ndJsonStream>;
} {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
  const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);
  return { agentStream, clientStream };
}

function makeMinimalHarness(): KimiHarness {
  // ext_method does not touch the harness; the auth/session surface
  // is irrelevant for these tests so the stub keeps the harness flat.
  return {} as unknown as KimiHarness;
}

function makeSteerHarness(steered: PromptInput[]): KimiHarness {
  return {
    auth: { status: async () => AUTHED_STATUS },
    createSession: async (options: { id?: string }) =>
      ({
        id: options.id ?? 'session-steer',
        steer: async (input: PromptInput) => {
          steered.push(input);
        },
      }) as Session,
    getConfig: async () => ({ providers: {}, models: {} }),
  } as unknown as KimiHarness;
}

describe('AcpServer ext method surface', () => {
  it('unit-level extMethod throws RequestError.methodNotFound with the method name', async () => {
    const server = new AcpServer(makeMinimalHarness());
    await expect(server.extMethod('myorg.foo', {})).rejects.toMatchObject({
      // JSON-RPC method-not-found code per ACP SDK RequestError.methodNotFound.
      code: -32601,
      // RequestError stamps the requested method name into the message
      // so clients can distinguish "ext/foo" from "ext/bar".
      message: expect.stringContaining('myorg.foo'),
    });
  });

  it('unit-level extNotification throws RequestError.methodNotFound with the method name', async () => {
    const server = new AcpServer(makeMinimalHarness());
    await expect(server.extNotification('myorg.bar', {})).rejects.toMatchObject({
      code: -32601,
      message: expect.stringContaining('myorg.bar'),
    });
  });

  it('over-the-wire extMethod surfaces -32601 to a remote ACP client', async () => {
    const harness = makeMinimalHarness();
    const { agentStream, clientStream } = makeInMemoryStreamPair();

    new AgentSideConnection((c) => new AcpServer(harness, c), agentStream);
    const client = new ClientSideConnection((_a) => new StubClient(), clientStream);

    await expect(client.extMethod('myorg.unsupported', {})).rejects.toMatchObject({
      code: -32601,
    });
  });

  it('forwards ext/steer content for an open session', async () => {
    const steered: PromptInput[] = [];
    const { agentStream, clientStream } = makeInMemoryStreamPair();

    new AgentSideConnection(
      (connection) => new AcpServer(makeSteerHarness(steered), connection),
      agentStream,
    );
    const client = new ClientSideConnection((_agent) => new StubClient(), clientStream);
    const session = await client.newSession({ cwd: '/tmp/work', mcpServers: [] });

    await client.extMethod('ext/steer', {
      sessionId: session.sessionId,
      content: [{ type: 'text', text: 'Focus on the failing test.' }],
    });

    expect(steered).toEqual([[{ type: 'text', text: 'Focus on the failing test.' }]]);
  });
});
