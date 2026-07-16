/**
 * v2 engine backend for the ACP adapter.
 *
 * Bridges the engine-agnostic {@link AcpEngine} interface to a running
 * `kap-server` over its `/api/v2` native RPC surface using
 * `@moonshot-ai/klient`.
 */

import { Klient } from '@moonshot-ai/klient';
import type {
  IHostFileSystem,
  Interaction,
  ISessionLifecycleService as ISessionLifecycleServiceContract,
  SessionMeta,
  SessionSummary as V2SessionSummary,
} from '@moonshot-ai/agent-core-v2';
import type { McpServerConfig } from '@moonshot-ai/agent-core-v2/agent/mcp/config-schema';
import type { AgentConfigData } from '@moonshot-ai/agent-core-v2/agent/profile/profile';
import type { PromptPart } from '@moonshot-ai/agent-core-v2/agent/rpc/core-api';
import type { SwarmModeTrigger } from '@moonshot-ai/agent-core-v2/agent/swarm/swarm';
import {
  IAgentContextMemoryService,
  IAgentRPCService,
  IAuthSummaryService,
  IConfigService,
  IModelCatalogService,
  IProviderService,
  ISessionIndex,
  ISessionInteractionService,
  ISessionLifecycleService,
  ISessionMetadata,
  ISessionRPCService,
  MAIN_AGENT_ID,
} from '@moonshot-ai/agent-core-v2';
import type {
  ApprovalRequest,
  ApprovalResponse,
  BackgroundTaskInfo,
  ContextMessage,
  Event,
  McpServerInfo,
  ModelAlias,
  PermissionMode,
  PromptInput,
  QuestionAnswers,
  QuestionRequest,
  SessionStatus,
  SessionSummary,
  SessionUsage,
  SkillSummary,
  ThinkingEffort,
} from '@moonshot-ai/kimi-code-sdk';

import type {
  AcpEngine,
  AcpEngineAuthStatus,
  AcpEngineCreateSessionOptions,
  AcpEngineListSessionsOptions,
  AcpEngineResumeSessionOptions,
  AcpEngineSession,
} from '../engine';
import { KaosHostFileSystem } from './kaos-host-file-system';

const DEFAULT_IMAGE_MAX_EDGE = 4096;

type V2PromptInput = readonly PromptPart[];

type ResumeState = {
  agents?: Record<
    string,
    {
      config?: { modelAlias?: string; thinkingEffort?: string };
      context?: { history?: readonly ContextMessage[] };
    }
  >;
};

interface RemoteInteractionService {
  respond(id: string, response: unknown): Promise<void>;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function hasNonEmptyApiKey(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasConfiguredApiKey(
  providers: Readonly<Record<string, { readonly apiKey?: string }>>,
  config: Readonly<Record<string, unknown>>,
): boolean {
  if (Object.values(providers).some((provider) => hasNonEmptyApiKey(provider.apiKey))) return true;

  if (Object.values(asRecord(config['models'])).some((model) => hasNonEmptyApiKey(asRecord(model)['apiKey']))) {
    return true;
  }

  return Object.values(asRecord(config['platforms'])).some((platform) =>
    hasNonEmptyApiKey(asRecord(asRecord(platform)['auth'])['apiKey']),
  );
}

function asV2PromptInput(input: PromptInput): V2PromptInput {
  // v1 PromptInput and v2 PromptInput are structurally the same subset of
  // ContentPart (text / image_url / video_url).
  return input as unknown as V2PromptInput;
}

function v2SummaryToV1(summary: V2SessionSummary): SessionSummary {
  return {
    id: summary.id,
    title: summary.title,
    lastPrompt: summary.lastPrompt,
    workDir: summary.cwd ?? '',
    sessionDir: '',
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    archived: summary.archived,
    metadata: summary.custom as import('@moonshot-ai/kimi-code-sdk').JsonObject | undefined,
    additionalDirs: [],
  };
}

function v2SessionMetaToV1Summary(meta: SessionMeta): SessionSummary {
  return {
    id: meta.id,
    title: meta.title,
    lastPrompt: meta.lastPrompt,
    workDir: meta.cwd ?? '',
    sessionDir: '',
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    archived: meta.archived,
    metadata: meta.custom as import('@moonshot-ai/kimi-code-sdk').JsonObject | undefined,
    additionalDirs: [],
  };
}

function v2DomainEventToV1(sessionId: string, agentId: string, event: Event): Event {
  return { ...((event as unknown) as Record<string, unknown>), sessionId, agentId } as Event;
}

class V2AcpEngineSession implements AcpEngineSession {
  private summary_?: SessionSummary;
  private resumeState_?: ResumeState;

  constructor(
    private readonly engine: V2AcpEngine,
    readonly id: string,
    readonly hostFileSystem?: IHostFileSystem,
  ) {}

  get summary(): SessionSummary | undefined {
    return this.summary_;
  }

  setSummary(summary: SessionSummary): void {
    this.summary_ = summary;
  }

  setResumeState(state: ResumeState): void {
    this.resumeState_ = state;
  }

  getResumeState(): ResumeState | undefined {
    return this.resumeState_;
  }

  private approvalHandler?: (req: ApprovalRequest) => Promise<ApprovalResponse> | ApprovalResponse;
  private questionHandler?: (req: QuestionRequest) => Promise<QuestionAnswers | null> | QuestionAnswers | null;
  private knownInteractions = new Set<string>();
  private interactionsUnsub?: () => void;
  private eventSubscriptionReady?: Promise<void>;

  setApprovalHandler(handler: (req: ApprovalRequest) => Promise<ApprovalResponse> | ApprovalResponse): void {
    this.approvalHandler = handler;
    this.ensureInteractionsSubscription();
    this.refreshInteractions();
  }

  setQuestionHandler(
    handler: (req: QuestionRequest) => Promise<QuestionAnswers | null> | QuestionAnswers | null,
  ): void {
    this.questionHandler = handler;
    this.ensureInteractionsSubscription();
    this.refreshInteractions();
  }

  private ensureInteractionsSubscription(): void {
    if (this.interactionsUnsub !== undefined) return;
    const ws = this.engine.klient.ws();
    this.engine.markWsOpened();
    const session = ws.session(this.id);
    const sub = session.listen('interactions', (list) => {
      void this.handleInteractions(list as readonly Interaction[]);
    });
    this.interactionsUnsub = () => {
      sub.dispose();
    };
  }

  private refreshInteractions(): void {
    const session = this.engine.klient.ws().session(this.id);
    void Promise.resolve(session.service(ISessionInteractionService).listPending())
      .then((list) => this.handleInteractions(list))
      .catch(() => undefined);
  }

  private async handleInteractions(list: readonly Interaction[]): Promise<void> {
    for (const interaction of list) {
      if (this.knownInteractions.has(interaction.id)) continue;

      if (interaction.kind === 'approval' && this.approvalHandler !== undefined) {
        this.knownInteractions.add(interaction.id);
        const req = v2InteractionToV1ApprovalRequest(interaction);
        try {
          const res = await this.approvalHandler(req);
          await this.respondInteraction(interaction.id, res);
        } catch {
          await this.respondInteraction(interaction.id, { decision: 'rejected' });
        }
      } else if (interaction.kind === 'question' && this.questionHandler !== undefined) {
        this.knownInteractions.add(interaction.id);
        const req = v2InteractionToV1QuestionRequest(interaction);
        try {
          const res = await this.questionHandler(req);
          await this.respondInteraction(interaction.id, res);
        } catch {
          await this.respondInteraction(interaction.id, null);
        }
      }
    }
  }

  onEvent(listener: (event: Event) => void): () => void {
    const ws = this.engine.klient.ws();
    this.engine.markWsOpened();
    const sub = ws
      .session(this.id)
      .agent(MAIN_AGENT_ID)
      .listen('events', (event) => {
        listener(v2DomainEventToV1(this.id, MAIN_AGENT_ID, event as Event));
      });
    this.eventSubscriptionReady = sub.ready;
    return () => {
      sub.dispose();
      if (this.eventSubscriptionReady === sub.ready) this.eventSubscriptionReady = undefined;
    };
  }

  async prompt(input: PromptInput): Promise<void> {
    await this.eventSubscriptionReady;
    await this.agentRpc.prompt({ input: asV2PromptInput(input) });
  }

  async steer(input: PromptInput): Promise<void> {
    await this.agentRpc.steer({ input: asV2PromptInput(input) });
  }

  async cancel(): Promise<void> {
    await this.agentRpc.cancel({});
  }

  async activateSkill(name: string, args?: string): Promise<void> {
    await this.agentRpc.activateSkill({ name, args });
  }

  async setModel(model: string): Promise<void> {
    await this.agentRpc.setModel({ model });
  }

  async setThinking(effort: ThinkingEffort): Promise<void> {
    await this.agentRpc.setThinking({ level: effort });
  }

  async setPermission(mode: PermissionMode): Promise<void> {
    await this.agentRpc.setPermission({ mode });
  }

  async setPlanMode(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.agentRpc.enterPlan({});
    } else {
      await this.agentRpc.cancelPlan({});
    }
  }

  async setSwarmMode(enabled: boolean, trigger: string): Promise<void> {
    if (enabled) {
      await this.agentRpc.enterSwarm({ trigger: trigger as SwarmModeTrigger });
    } else {
      await this.agentRpc.exitSwarm({});
    }
  }

  async init(): Promise<void> {
    await this.sessionRpc.generateAgentsMd({});
  }

  async reloadSession(): Promise<unknown> {
    this.disposeInteractionsSubscription();
    await this.engine.reloadSession(this);
    this.knownInteractions.clear();
    if (this.approvalHandler !== undefined || this.questionHandler !== undefined) {
      this.ensureInteractionsSubscription();
    }
    return this.summary;
  }

  async compact(input: { instruction?: string }): Promise<void> {
    await this.agentRpc.beginCompaction({ instruction: input.instruction });
  }

  async getStatus(): Promise<SessionStatus> {
    const [config, permission, plan, swarmMode, context, usage] = await Promise.all([
      this.safeCall(() => this.sessionRpc.getConfig({ agentId: MAIN_AGENT_ID })),
      this.safeCall(() => this.agentRpc.getPermission({})),
      this.safeCall(() => this.agentRpc.getPlan({})),
      this.safeCall(() => this.agentRpc.getSwarmMode({})),
      this.safeCall(() => this.agentRpc.getContext({})),
      this.safeCall(() => this.agentRpc.getUsage({})),
    ]);
    const models = await this.safeCall(() => this.engine.listModels());
    const maxContextTokens = config?.modelAlias === undefined
      ? 0
      : (models?.[config.modelAlias]?.maxContextSize ?? 0);
    const contextTokens = context?.tokenCount ?? 0;
    return {
      model: config?.modelAlias,
      thinkingEffort: config?.thinkingLevel ?? 'off',
      permission: permission?.mode ?? 'manual',
      planMode: plan !== null && plan !== undefined,
      swarmMode: swarmMode ?? false,
      contextTokens,
      maxContextTokens,
      contextUsage: maxContextTokens > 0 ? contextTokens / maxContextTokens : 0,
      usage: usage as unknown as SessionUsage | undefined,
    } as SessionStatus;
  }

  async getUsage(): Promise<SessionUsage> {
    const usage = await this.agentRpc.getUsage({});
    return usage as unknown as SessionUsage;
  }

  async listMcpServers(): Promise<readonly McpServerInfo[]> {
    const servers = await this.sessionRpc.listMcpServers({});
    return servers as unknown as readonly McpServerInfo[];
  }

  async listBackgroundTasks(): Promise<readonly BackgroundTaskInfo[]> {
    const tasks = await this.agentRpc.getTasks({ activeOnly: false, limit: 100 });
    return tasks as unknown as readonly BackgroundTaskInfo[];
  }

  async listSkills(): Promise<readonly SkillSummary[]> {
    const skills = await this.sessionRpc.listSkills({});
    return skills as unknown as readonly SkillSummary[];
  }

  async close(): Promise<void> {
    this.disposeInteractionsSubscription();
    await this.engine.klient
      .core(ISessionLifecycleService)
      .close(this.id)
      .catch(() => undefined);
  }

  private disposeInteractionsSubscription(): void {
    this.interactionsUnsub?.();
    this.interactionsUnsub = undefined;
  }

  private async safeCall<T>(fn: () => T | Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  }

  private get agentRpc(): IAgentRPCService {
    return this.engine.klient.session(this.id).agent(MAIN_AGENT_ID).service(IAgentRPCService);
  }

  private get sessionRpc(): ISessionRPCService {
    return this.engine.klient.session(this.id).service(ISessionRPCService);
  }

  private get interactionService(): RemoteInteractionService {
    return this.engine.klient
      .session(this.id)
      .service(ISessionInteractionService) as unknown as RemoteInteractionService;
  }

  private respondInteraction(id: string, response: unknown): Promise<void> {
    return this.interactionService.respond(id, response);
  }
}

function v2InteractionToV1ApprovalRequest(interaction: Interaction): ApprovalRequest {
  const payload = interaction.payload as {
    toolCallId?: string;
    toolName: string;
    action: string;
    display: ApprovalRequest['display'];
    turnId?: number;
  };
  return {
    turnId: interaction.origin?.turnId ?? payload.turnId,
    toolCallId: payload.toolCallId ?? interaction.id,
    toolName: payload.toolName,
    action: payload.action,
    display: payload.display,
  };
}

function v2InteractionToV1QuestionRequest(interaction: Interaction): QuestionRequest {
  const payload = interaction.payload as QuestionRequest;
  return {
    turnId: payload.turnId ?? interaction.origin?.turnId,
    toolCallId: payload.toolCallId,
    questions: payload.questions,
  };
}

export interface V2AcpEngineOptions {
  /** Base URL of the kap-server, e.g. `http://127.0.0.1:58627`. */
  readonly url: string;
  /** Optional bearer token for the v2 server. */
  readonly token?: string;
  /** In-process kap-server services used for per-session host overrides. */
  readonly embeddedHost?: {
    readonly lifecycle: ISessionLifecycleServiceContract;
    readonly hostFileSystem: IHostFileSystem;
  };
}

export class V2AcpEngine implements AcpEngine {
  readonly acpEngine = true as const;
  readonly klient: Klient;
  private wsOpened = false;
  private readonly embeddedHost?: V2AcpEngineOptions['embeddedHost'];

  constructor(options: V2AcpEngineOptions) {
    this.klient = new Klient({ url: options.url, token: options.token });
    this.embeddedHost = options.embeddedHost;
  }

  get auth(): { status(): Promise<AcpEngineAuthStatus> } {
    return {
      status: async () => {
        const [statuses, providers, config] = await Promise.all([
          this.klient.core(IAuthSummaryService).summarize(),
          Promise.resolve(this.klient.core(IProviderService).list()),
          Promise.resolve(this.klient.core(IConfigService).getAll()),
        ]);
        return {
          providers: [
            ...statuses.map((status) => ({ hasToken: status.loggedIn })),
            ...(hasConfiguredApiKey(providers, config) ? [{ hasToken: true }] : []),
          ],
        };
      },
    };
  }

  async createSession(options: AcpEngineCreateSessionOptions): Promise<AcpEngineSession> {
    const hostFileSystem = this.makeHostFileSystem(options.kaos);
    const createOptions = {
      sessionId: options.id,
      workDir: options.workDir,
      mcpServers: options.mcpServers as Readonly<Record<string, McpServerConfig>> | undefined,
      hostFileSystem,
    };
    const handle =
      this.embeddedHost === undefined
        ? await this.klient.core(ISessionLifecycleService).create(createOptions)
        : await this.embeddedHost.lifecycle.create(createOptions);
    const sessionId = handle.id;
    const meta = await this.klient.session(sessionId).service(ISessionMetadata).read();
    const session = new V2AcpEngineSession(this, sessionId, hostFileSystem);
    session.setSummary(v2SessionMetaToV1Summary(meta));
    await this.hydrateResumeState(session);
    const defaultModel = await this.getDefaultModel();
    if (defaultModel !== '') {
      await session.setModel(defaultModel);
    }
    return session;
  }

  async resumeSession(options: AcpEngineResumeSessionOptions): Promise<AcpEngineSession> {
    const hostFileSystem = this.makeHostFileSystem(options.kaos);
    const resumeOptions = {
      mcpServers: options.mcpServers as Readonly<Record<string, McpServerConfig>> | undefined,
      hostFileSystem,
    };
    const handle =
      this.embeddedHost === undefined
        ? await this.klient.core(ISessionLifecycleService).resume(options.id, resumeOptions)
        : await this.embeddedHost.lifecycle.resume(options.id, resumeOptions);
    if (handle === undefined) {
      throw new Error(`Session not found: ${options.id}`);
    }
    const sessionId = handle.id;
    const meta = await this.klient.session(sessionId).service(ISessionMetadata).read();
    const session = new V2AcpEngineSession(this, sessionId, hostFileSystem);
    session.setSummary(v2SessionMetaToV1Summary(meta));
    await this.hydrateResumeState(session);
    return session;
  }

  async reloadSession(session: V2AcpEngineSession): Promise<void> {
    const lifecycle =
      this.embeddedHost?.lifecycle ?? this.klient.core(ISessionLifecycleService);
    await lifecycle.close(session.id);
    const handle = await lifecycle.resume(session.id, {
      hostFileSystem: session.hostFileSystem,
    });
    if (handle === undefined) {
      throw new Error(`Session not found: ${session.id}`);
    }
    const meta = await this.klient.session(session.id).service(ISessionMetadata).read();
    session.setSummary(v2SessionMetaToV1Summary(meta));
    await this.hydrateResumeState(session);
  }

  async listSessions(options?: AcpEngineListSessionsOptions): Promise<readonly SessionSummary[]> {
    const page = await this.klient.core(ISessionIndex).list({ limit: 100 });
    const summaries = page.items.map((s) => v2SummaryToV1(s));
    return options?.workDir === undefined
      ? summaries
      : summaries.filter((s) => s.workDir === options.workDir);
  }

  async getDefaultModel(): Promise<string> {
    const config = await Promise.resolve(this.klient.core(IConfigService).getAll());
    const value = config['defaultModel'];
    if (typeof value === 'string' && value.length > 0) return value;
    return Object.keys(await this.listModels())[0] ?? '';
  }

  async getDefaultThinkingSupported(): Promise<boolean> {
    const defaultModel = await this.getDefaultModel();
    const models = await this.listModels();
    const alias = models[defaultModel];
    if (alias === undefined) return false;
    const lower = (alias.model ?? '').toLowerCase();
    const capabilities = Array.isArray(alias.capabilities) ? alias.capabilities : [];
    return (
      capabilities.includes('thinking') ||
      capabilities.includes('always_thinking') ||
      lower.includes('thinking') ||
      lower.includes('reason')
    );
  }

  async getDefaultThinkingEnabled(): Promise<boolean> {
    const config = await Promise.resolve(this.klient.core(IConfigService).getAll());
    const thinking = config['thinking'] as { enabled?: boolean; effort?: string } | undefined;
    if (typeof thinking?.enabled === 'boolean') return thinking.enabled;
    if (typeof thinking?.effort === 'string' && thinking.effort.length > 0 && thinking.effort !== 'off') {
      return true;
    }
    return false;
  }

  async listModels(): Promise<Readonly<Record<string, ModelAlias>>> {
    const catalog = await this.klient.core(IModelCatalogService).listModels();
    return Object.fromEntries(
      catalog.map((model) => [
        model.model,
        {
          provider: model.provider,
          model: model.model,
          maxContextSize: model.max_context_size,
          displayName: model.display_name,
          capabilities: model.capabilities,
          supportEfforts: model.support_efforts,
          defaultEffort: model.default_effort,
        } satisfies ModelAlias,
      ]),
    );
  }

  get imageLimits(): { maxEdgePx(): number } {
    return { maxEdgePx: () => DEFAULT_IMAGE_MAX_EDGE };
  }

  track(_event: string, _properties?: Record<string, unknown>): void {
    // v2 telemetry is emitted server-side; the adapter has no client-side sink.
  }

  async close(): Promise<void> {
    if (this.wsOpened) {
      this.klient.ws().close();
    }
  }

  /** @internal — called by sessions so engine.close knows a ws was opened. */
  markWsOpened(): void {
    this.wsOpened = true;
  }

  private makeHostFileSystem(kaos: AcpEngineCreateSessionOptions['kaos']): IHostFileSystem | undefined {
    if (kaos === undefined) return undefined;
    if (this.embeddedHost === undefined) {
      throw new Error('A Kaos override requires an in-process kap-server host');
    }
    return new KaosHostFileSystem(kaos, this.embeddedHost.hostFileSystem);
  }

  private async hydrateResumeState(session: V2AcpEngineSession): Promise<void> {
    const [config, history] = await Promise.all([
      Promise.resolve(
        this.klient.session(session.id).service(ISessionRPCService).getConfig({ agentId: MAIN_AGENT_ID }),
      ).catch(() => undefined as AgentConfigData | undefined),
      Promise.resolve(
        this.klient.session(session.id).agent(MAIN_AGENT_ID).service(IAgentContextMemoryService).get(),
      ).catch(() => [] as readonly import('@moonshot-ai/agent-core-v2/agent/contextMemory/types').ContextMessage[]),
    ]);
    session.setResumeState({
      agents: {
        [MAIN_AGENT_ID]: {
          config: {
            modelAlias: config?.modelAlias,
            thinkingEffort: config?.thinkingLevel,
          },
          context: { history: history as unknown as readonly ContextMessage[] },
        },
      },
    });
  }
}
