/**
 * Engine abstraction for the ACP adapter.
 *
 * The adapter's protocol surface (`AcpServer`, `AcpSession`, event mapping,
 * slash commands) is engine-agnostic. Concrete engines bridge that surface to
 * either the legacy v1 SDK (`@moonshot-ai/kimi-code-sdk`) or the v2 DI × Scope
 * engine (`@moonshot-ai/agent-core-v2` via `@moonshot-ai/klient`).
 */

import type { Kaos } from '@moonshot-ai/kaos';
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

/**
 * Per-session handle exposed by an {@link AcpEngine}. Mirrors the subset of
 * the v1 SDK `Session` interface that `AcpSession` actually uses, so the
 * adapter can drive both engines through the same call sites.
 */
export interface AcpEngineSession {
  readonly id: string;
  readonly summary?: SessionSummary;

  setApprovalHandler(handler: (req: ApprovalRequest) => Promise<ApprovalResponse> | ApprovalResponse): void;
  setQuestionHandler(
    handler: (req: QuestionRequest) => (QuestionAnswers | null) | Promise<QuestionAnswers | null>,
  ): void;

  onEvent(listener: (event: Event) => void): () => void;

  prompt(input: PromptInput): Promise<void>;
  activateSkill(name: string, args?: string): Promise<void>;
  steer(input: PromptInput): Promise<void>;
  cancel(): Promise<void>;

  setModel(model: string): Promise<void>;
  setThinking(effort: ThinkingEffort): Promise<void>;
  setPermission(mode: PermissionMode): Promise<void>;
  setPlanMode(enabled: boolean): Promise<void>;
  setSwarmMode(enabled: boolean, mode: string): Promise<void>;

  init(): Promise<void>;
  reloadSession(): Promise<unknown>;
  compact(input: { instruction?: string }): Promise<void>;

  getStatus(): Promise<SessionStatus>;
  getUsage(): Promise<SessionUsage>;
  listMcpServers(): Promise<readonly McpServerInfo[]>;
  listBackgroundTasks(): Promise<readonly BackgroundTaskInfo[]>;
  listSkills(): Promise<readonly SkillSummary[]>;

  getResumeState(): {
    agents?: Record<
      string,
      {
        config?: { modelAlias?: string; thinkingEffort?: string };
        context?: { history?: readonly ContextMessage[] };
      }
    >;
  } | undefined;

  close(): Promise<void>;
}

/**
 * Per-session creation options. Intentionally a narrow subset of the v1 SDK
 * `CreateSessionOptions` so the engine can translate to its own backend.
 */
export interface AcpEngineCreateSessionOptions {
  readonly id: string;
  readonly workDir: string;
  readonly kaos?: Kaos;
  readonly persistenceKaos?: Kaos;
  readonly mcpServers?: Record<string, unknown>;
  readonly sessionStartedProperties?: Record<string, unknown>;
}

export interface AcpEngineResumeSessionOptions {
  readonly id: string;
  readonly kaos?: Kaos;
  readonly persistenceKaos?: Kaos;
  readonly mcpServers?: Record<string, unknown>;
  readonly sessionStartedProperties?: Record<string, unknown>;
}

export interface AcpEngineListSessionsOptions {
  readonly workDir?: string;
}

/**
 * Auth status snapshot returned by the engine. The ACP adapter only needs to
 know whether at least one provider has a usable token.
 */
export interface AcpEngineAuthStatus {
  readonly providers: ReadonlyArray<{ hasToken: boolean }>;
}

/**
 * Engine-level facade. Mirrors the subset of the v1 SDK `KimiHarness` that
 * `AcpServer` uses.
 */
export interface AcpEngine {
  readonly acpEngine: true;

  readonly auth: {
    status(): Promise<AcpEngineAuthStatus>;
  };

  createSession(options: AcpEngineCreateSessionOptions): Promise<AcpEngineSession>;
  resumeSession(options: AcpEngineResumeSessionOptions): Promise<AcpEngineSession>;
  listSessions(options?: AcpEngineListSessionsOptions): Promise<readonly SessionSummary[]>;

  /**
   * Current base model id (no `,thinking` suffix). Falls back to the first
   * available model alias when not explicitly configured.
   */
  getDefaultModel?(): Promise<string>;

  /**
   * Whether the current default model supports thinking. Used to decide
   * whether to advertise the thinking toggle.
   */
  getDefaultThinkingSupported?(): Promise<boolean>;

  /**
   * Whether thinking is enabled by default for new sessions. Mirrors
   * `config.thinking.enabled` / `config.thinking.effort` on v1.
   */
  getDefaultThinkingEnabled?(): Promise<boolean>;

  /**
   * Full model catalog from config. Used to build the ACP `configOptions`
   * picker. Optional — when absent the picker falls back to a single entry
   * derived from `getDefaultModel`.
   */
  listModels?(): Promise<readonly ModelAlias[] | Readonly<Record<string, ModelAlias>>>;

  /**
   * Image limits for prompt image compression. Optional — when absent the
   * adapter uses a default limit.
   */
  imageLimits?: { maxEdgePx(): number };

  /**
   * Telemetry sink. Optional — when absent the adapter becomes a silent
   * passthrough.
   */
  readonly track?: (event: string, properties?: Record<string, unknown>) => void;

  close(): Promise<void>;
}
