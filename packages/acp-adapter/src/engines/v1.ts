/**
 * v1 engine backend for the ACP adapter.
 *
 * Wraps `@moonshot-ai/kimi-code-sdk` (`KimiHarness` / `Session`) and exposes
 * it through the engine-agnostic {@link AcpEngine} interface.
 */

import type {
  ApprovalRequest,
  ApprovalResponse,
  BackgroundTaskInfo,
  Event,
  KimiHarness,
  McpServerInfo,
  PermissionMode,
  PromptInput,
  QuestionAnswers,
  QuestionRequest,
  Session,
  SessionStatus,
  SessionSummary,
  SessionUsage,
  SkillSummary,
  ThinkingEffort,
} from '@moonshot-ai/kimi-code-sdk';
import { effectiveModelAlias } from '@moonshot-ai/agent-core';

import type {
  AcpEngine,
  AcpEngineAuthStatus,
  AcpEngineCreateSessionOptions,
  AcpEngineListSessionsOptions,
  AcpEngineResumeSessionOptions,
  AcpEngineSession,
} from '../engine';

class V1AcpEngineSession implements AcpEngineSession {
  constructor(private readonly session: Session) {}

  get id(): string {
    return this.session.id;
  }

  get summary(): SessionSummary | undefined {
    return this.session.summary;
  }

  setApprovalHandler(handler: (req: ApprovalRequest) => Promise<ApprovalResponse> | ApprovalResponse): void {
    if (typeof this.session.setApprovalHandler === 'function') {
      this.session.setApprovalHandler(handler);
    }
  }

  setQuestionHandler(
    handler: (req: QuestionRequest) => (QuestionAnswers | null) | Promise<QuestionAnswers | null>,
  ): void {
    if (typeof this.session.setQuestionHandler === 'function') {
      this.session.setQuestionHandler(handler);
    }
  }

  onEvent(listener: (event: Event) => void): () => void {
    return this.session.onEvent(listener);
  }

  prompt(input: PromptInput): Promise<void> {
    return this.session.prompt(input);
  }

  activateSkill(name: string, args?: string): Promise<void> {
    return this.session.activateSkill(name, args);
  }

  steer(input: PromptInput): Promise<void> {
    if (typeof this.session.steer !== 'function') {
      return Promise.reject(new Error('Session.steer is not supported by this SDK version'));
    }
    return this.session.steer(input);
  }

  cancel(): Promise<void> {
    return this.session.cancel();
  }

  setModel(model: string): Promise<void> {
    return this.session.setModel(model);
  }

  setThinking(effort: ThinkingEffort): Promise<void> {
    if (typeof this.session.setThinking !== 'function') {
      return Promise.reject(new Error('Session.setThinking is not supported by this SDK version'));
    }
    return this.session.setThinking(effort);
  }

  setPermission(mode: PermissionMode): Promise<void> {
    return this.session.setPermission(mode);
  }

  setPlanMode(enabled: boolean): Promise<void> {
    return this.session.setPlanMode(enabled);
  }

  setSwarmMode(enabled: boolean, trigger: string): Promise<void> {
    if (typeof this.session.setSwarmMode !== 'function') {
      return Promise.reject(new Error('Session.setSwarmMode is not supported by this SDK version'));
    }
    return this.session.setSwarmMode(enabled, trigger as unknown as Parameters<typeof this.session.setSwarmMode>[1]);
  }

  init(): Promise<void> {
    if (typeof this.session.init !== 'function') {
      return Promise.reject(new Error('Session.init is not supported by this SDK version'));
    }
    return this.session.init();
  }

  reloadSession(): Promise<unknown> {
    if (typeof this.session.reloadSession !== 'function') {
      return Promise.reject(new Error('Session.reloadSession is not supported by this SDK version'));
    }
    return this.session.reloadSession() as Promise<unknown>;
  }

  compact(input: { instruction?: string }): Promise<void> {
    if (typeof this.session.compact !== 'function') {
      return Promise.reject(new Error('Session.compact is not supported by this SDK version'));
    }
    return this.session.compact(input);
  }

  getStatus(): Promise<SessionStatus> {
    return this.session.getStatus();
  }

  getUsage(): Promise<SessionUsage> {
    if (typeof this.session.getUsage !== 'function') {
      return Promise.reject(new Error('Session.getUsage is not supported by this SDK version'));
    }
    return this.session.getUsage();
  }

  listMcpServers(): Promise<readonly McpServerInfo[]> {
    if (typeof this.session.listMcpServers !== 'function') {
      return Promise.reject(new Error('Session.listMcpServers is not supported by this SDK version'));
    }
    return this.session.listMcpServers();
  }

  listBackgroundTasks(): Promise<readonly BackgroundTaskInfo[]> {
    if (typeof this.session.listBackgroundTasks !== 'function') {
      return Promise.reject(new Error('Session.listBackgroundTasks is not supported by this SDK version'));
    }
    return this.session.listBackgroundTasks();
  }

  listSkills(): Promise<readonly SkillSummary[]> {
    if (typeof this.session.listSkills !== 'function') {
      return Promise.reject(new Error('Session.listSkills is not supported by this SDK version'));
    }
    return this.session.listSkills();
  }

  getResumeState():
    | { agents?: Record<string, { config?: { modelAlias?: string; thinkingEffort?: string } }> }
    | undefined {
    if (typeof this.session.getResumeState !== 'function') {
      return undefined;
    }
    return this.session.getResumeState();
  }

  close(): Promise<void> {
    if (typeof this.session.close !== 'function') {
      return Promise.resolve();
    }
    return this.session.close();
  }
}

export class V1AcpEngine implements AcpEngine {
  readonly acpEngine = true as const;

  get imageLimits(): { maxEdgePx(): number } | undefined {
    return this.harness.imageLimits;
  }

  constructor(private readonly harness: KimiHarness) {}

  get auth(): { status(): Promise<AcpEngineAuthStatus> } {
    return {
      status: async () => {
        const status = await this.harness.auth.status();
        return { providers: status.providers.map((p) => ({ hasToken: p.hasToken })) };
      },
    };
  }

  async createSession(options: AcpEngineCreateSessionOptions): Promise<AcpEngineSession> {
    const session = await this.harness.createSession({
      id: options.id,
      workDir: options.workDir,
      kaos: options.kaos,
      persistenceKaos: options.persistenceKaos,
      mcpServers: options.mcpServers,
      sessionStartedProperties: options.sessionStartedProperties,
    } as import('@moonshot-ai/kimi-code-sdk').CreateSessionOptions);
    return new V1AcpEngineSession(session);
  }

  async resumeSession(options: AcpEngineResumeSessionOptions): Promise<AcpEngineSession> {
    const session = await this.harness.resumeSession({
      id: options.id,
      kaos: options.kaos,
      persistenceKaos: options.persistenceKaos,
      mcpServers: options.mcpServers,
      sessionStartedProperties: options.sessionStartedProperties,
    } as import('@moonshot-ai/kimi-code-sdk').ResumeSessionInput);
    return new V1AcpEngineSession(session);
  }

  async listSessions(options?: AcpEngineListSessionsOptions): Promise<readonly SessionSummary[]> {
    return this.harness.listSessions(options ?? {});
  }

  async getDefaultModel(): Promise<string> {
    if (typeof this.harness.getConfig !== 'function') {
      return '';
    }
    const config = await this.harness.getConfig();
    return config.defaultModel ?? '';
  }

  async getDefaultThinkingSupported(): Promise<boolean> {
    // v1 SDK does not expose a direct thinking-supported API on the harness.
    // The ACP adapter already derives this from the model catalog; return
    // `true` here so the existing catalog-based resolution remains the source
    // of truth.
    return true;
  }

  async getDefaultThinkingEnabled(): Promise<boolean> {
    if (typeof this.harness.getConfig !== 'function') return false;
    try {
      const config = await this.harness.getConfig();
      const thinking = (config as { thinking?: { enabled?: unknown; effort?: unknown } }).thinking;
      if (thinking?.enabled === false) return false;
      if (typeof thinking?.effort === 'string' && thinking.effort.length > 0) {
        return thinking.effort.trim().toLowerCase() !== 'off';
      }
      return thinking?.enabled === true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<Readonly<Record<string, import('@moonshot-ai/kimi-code-sdk').ModelAlias>>> {
    if (typeof this.harness.getConfig !== 'function') {
      return {};
    }
    const config = await this.harness.getConfig();
    const models = config.models;
    if (models === undefined) return {};
    return Object.fromEntries(
      Object.entries(models).map(([id, alias]) => {
        const providerName = alias.provider ?? config.defaultProvider;
        const anthropicCompatible =
          providerName !== undefined && config.providers?.[providerName]?.type === 'anthropic';
        return [id, effectiveModelAlias(alias, anthropicCompatible)];
      }),
    );
  }

  track(event: string, properties?: Record<string, unknown>): void {
    if (typeof this.harness.track === 'function') {
      this.harness.track(event, properties as Parameters<typeof this.harness.track>[1]);
    }
  }

  async close(): Promise<void> {
    await this.harness.close();
  }
}
