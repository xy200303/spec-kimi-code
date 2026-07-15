/**
 * Scenario: v2 human interactions cross the kap-server boundary.
 *
 * Exercises approval and question responses through the public engine session
 * contract with the in-process server as the only external boundary.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ISessionInteractionService } from '@moonshot-ai/agent-core-v2';
import { startServer } from '@moonshot-ai/kap-server';

import { V2AcpEngine } from '../src/engines/v2';

describe('V2AcpEngineSession interactions', () => {
  it('forwards an approval request to the registered handler and responds', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-approval-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
    });
    try {
      const session = await engine.createSession({ id: 'sess-approval', workDir: home });

      let captured: unknown;
      session.setApprovalHandler(async (req) => {
        captured = req;
        return { decision: 'approved', feedback: 'ok' };
      });

      const response = await engine.klient
        .session(session.id)
        .service(ISessionInteractionService)
        .request({
          id: 'approval-1',
          kind: 'approval',
          payload: {
            toolCallId: 'call-1',
            toolName: 'Bash',
            action: 'Run shell command',
            display: { kind: 'default', summary: 'ls', detail: ['-la'] },
          },
          origin: { agentId: 'main', turnId: 1 },
        });

      expect(response).toEqual({ decision: 'approved', feedback: 'ok' });
      expect((captured as { toolCallId: string }).toolCallId).toBe('call-1');
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('forwards a question request to the registered handler and responds', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-question-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
    });
    try {
      const session = await engine.createSession({ id: 'sess-question', workDir: home });

      let captured: unknown;
      session.setQuestionHandler(async (req) => {
        captured = req;
        return { [req.questions[0]!.question]: 'Yes' };
      });

      const response = await engine.klient
        .session(session.id)
        .service(ISessionInteractionService)
        .request({
          id: 'question-1',
          kind: 'question',
          payload: {
            toolCallId: 'call-q',
            questions: [{ question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] }],
          },
          origin: { agentId: 'main', turnId: 2 },
        });

      expect(response).toEqual({ 'Continue?': 'Yes' });
      expect((captured as { questions: readonly { question: string }[] }).questions[0]!.question).toBe('Continue?');
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('handles a pending question when the question handler is registered after the approval handler', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kap-question-race-'));
    const server = await startServer({ host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const engine = new V2AcpEngine({
      url: `http://127.0.0.1:${server.port}`,
      token: server.authTokenService.getToken(),
    });
    try {
      const session = await engine.createSession({ id: 'sess-question-race', workDir: home });
      const wsSession = engine.klient.ws().session(session.id);
      engine.markWsOpened();
      const responsePromise = engine.klient
        .session(session.id)
        .service(ISessionInteractionService)
        .request({
          id: 'question-race',
          kind: 'question',
          payload: {
            toolCallId: 'call-race',
            questions: [{ question: 'Continue?', options: [{ label: 'Yes' }] }],
          },
          origin: { agentId: 'main', turnId: 3 },
        });
      const listPending = () =>
        Promise.resolve(
          engine.klient
            .session(session.id)
            .service(ISessionInteractionService)
            .listPending(),
        );
      let pending = await listPending();
      for (let attempt = 0; attempt < 20 && !pending.some((item) => item.id === 'question-race'); attempt++) {
        pending = await listPending();
      }
      expect(pending.some((item) => item.id === 'question-race')).toBe(true);

      session.setApprovalHandler(() => ({ decision: 'approved' }));
      await Promise.resolve(wsSession.service(ISessionInteractionService).listPending());
      session.setQuestionHandler((req) => ({ [req.questions[0]!.question]: 'Yes' }));

      await expect(responsePromise).resolves.toEqual({ 'Continue?': 'Yes' });
    } finally {
      await engine.close();
      await server.close();
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);
});
