/**
 * `plan` domain (L3) — `IAgentPlanService` implementation.
 *
 * Manages plan-mode state through `wire`, injects plan-mode context through
 * `contextInjector`, writes optional plan files through `hostFileSystem`,
 * and tags mode telemetry through `telemetry`. Bound at Agent scope.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'pathe';

import { Disposable } from '#/_base/di/lifecycle';
import { InstantiationType } from '#/_base/di/extensions';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { generateHeroSlug } from '#/_base/utils/hero-slug';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { SPEC_CODING_FLAG_ID } from '#/agent/plan/flag';
import { PlanModeInjection } from '#/agent/plan/injection/planModeInjection';
import { SpecWorkflowInjection } from '#/agent/plan/injection/specWorkflowInjection';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IFlagService } from '#/app/flag/flag';
import { IAgentTelemetryContextService } from '#/app/telemetry/agentTelemetryContext';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { ISessionContext } from '#/session/sessionContext/sessionContext';
import { IWireService } from '#/wire/wire';
import {
  IAgentPlanService,
  type PlanData,
  type PlanFilePath,
} from './plan';
import {
  PlanModel,
  planModeCancel,
  planModeEnter,
  planModeExit,
} from './planOps';

const SPEC_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export class AgentPlanService extends Disposable implements IAgentPlanService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IAgentContextMemoryService private readonly context: IAgentContextMemoryService,
    @IHostFileSystem private readonly hostFs: IHostFileSystem,
    @IAgentContextInjectorService dynamicInjector: IAgentContextInjectorService,
    @IFlagService private readonly flags: IFlagService,
    @IAgentTelemetryContextService private readonly telemetryContext: IAgentTelemetryContextService,
    @IWireService private readonly wire: IWireService,
    @ISessionContext private readonly sessionCtx: ISessionContext,
    @IAgentScopeContext private readonly agentCtx: IAgentScopeContext,
  ) {
    super();

    this._register(
      this.wire.hooks.onDidRestore.register('plan', async (_ctx, next) => {
        this.restoreTelemetryMode();
        await next();
      }),
    );

    this._register(new PlanModeInjection(dynamicInjector, this, this.context, this.flags));
    this._register(new SpecWorkflowInjection(dynamicInjector, this.flags, this.agentCtx.agentId));
  }

  private get isActive(): boolean {
    return this.wire.getModel(PlanModel).active;
  }

  private currentPlanFilePath(): PlanFilePath {
    const state = this.wire.getModel(PlanModel);
    if (!state.active || state.id === undefined) return null;
    return this.specDocumentsFor(state.id)?.spec ?? this.planFilePathFor(state.id);
  }

  private restoreTelemetryMode(): void {
    if (this.isActive) {
      this.telemetryContext.set({ mode: 'plan' });
    }
  }

  private createPlanId(): string {
    return generateHeroSlug(randomUUID(), new Set());
  }

  async enter(id?: string, createFile = false): Promise<void> {
    if (this.isActive) {
      throw new Error('Already in plan mode');
    }

    const planId = await this.resolvePlanId(id);
    const specDocuments = this.specDocumentsFor(planId);
    const planFilePath = specDocuments?.spec ?? this.planFilePathFor(planId);
    let enterRecorded = false;
    try {
      await this.ensurePlanDirectory(planFilePath);
      this.wire.dispatch(planModeEnter({ id: planId }));
      this.telemetryContext.set({ mode: 'plan' });
      enterRecorded = true;
      if (specDocuments !== undefined) {
        const date = new Date().toISOString().slice(0, 10);
        await this.hostFs.writeText(specDocuments.spec, specTemplate(planId, date));
        await this.hostFs.writeText(specDocuments.delivery, deliveryTemplate(planId));
      } else if (createFile) {
        await this.writeEmptyPlanFile(planFilePath);
      }
    } catch (error) {
      if (enterRecorded) {
        this.cancel(planId);
      }
      throw error;
    }
  }

  cancel(id?: string): void {
    this.wire.dispatch(planModeCancel({ id }));
    this.telemetryContext.set({ mode: 'agent' });
  }

  async clear(): Promise<void> {
    const path = this.currentPlanFilePath();
    if (path === null) return;
    await this.writeEmptyPlanFile(path);
  }

  exit(id?: string): void {
    this.wire.dispatch(planModeExit({ id }));
    this.telemetryContext.set({ mode: 'agent' });
  }

  async status(): Promise<PlanData> {
    const state = this.wire.getModel(PlanModel);
    if (!state.active || state.id === undefined) return null;
    const specDocuments = this.specDocumentsFor(state.id);
    const path = specDocuments?.spec ?? this.planFilePathFor(state.id);
    let content = '';
    try {
      content = await this.hostFs.readText(path);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    return {
      id: state.id,
      content,
      path,
      deliveryPath: specDocuments?.delivery,
    };
  }

  private async resolvePlanId(id: string | undefined): Promise<string> {
    if (!this.flags.enabled(SPEC_CODING_FLAG_ID)) return id ?? this.createPlanId();
    if (id === undefined || !SPEC_NAME_PATTERN.test(id)) return this.createPlanId();

    let candidate = id;
    for (let suffix = 2; ; suffix += 1) {
      try {
        await this.hostFs.stat(join(this.sessionCtx.cwd, 'specs', candidate));
        candidate = `${id}-${suffix}`;
      } catch {
        return candidate;
      }
    }
  }

  private planFilePathFor(id: string): string {
    return join(this.sessionCtx.sessionDir, 'agents', this.agentCtx.agentId, 'plans', `${id}.md`);
  }

  private specDocumentsFor(id: string): { readonly spec: string; readonly delivery: string } | undefined {
    if (!this.flags.enabled(SPEC_CODING_FLAG_ID)) return undefined;
    const root = join(this.sessionCtx.cwd, 'specs', id);
    return {
      spec: join(root, 'spec.md'),
      delivery: join(root, 'delivery.md'),
    };
  }

  private async writeEmptyPlanFile(path: string): Promise<void> {
    await this.ensurePlanDirectory(path);
    await this.hostFs.writeText(path, '');
  }

  private async ensurePlanDirectory(path: string): Promise<void> {
    await this.hostFs.mkdir(dirname(path), { recursive: true });
  }
}

function specTemplate(id: string, date: string): string {
  return `---
id: ${id}
type: feature          # feature | bugfix | optimize | refactor | docs
status: in_progress    # pending | in_progress | done | cancelled
priority: p2           # p0 | p1 | p2 | p3
mode: standard         # prototype | standard | strict
author: user
created: ${date}
updated: ${date}
---

# <标题>

## 用户原始描述

## 目标

## 验收标准

- [ ]

## 约束条件

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|

## 任务清单

### 进行中

### 已完成

### 待开始

- [ ]

## 风险与应对

| 风险 | 概率 | 影响 | 应对方案 |
|------|------|------|----------|

## 关键决策

## 待确认问题

## 变更记录

| 时间 | 操作人 | 变更内容 |
|------|--------|----------|
| ${date} | user | 初始需求 |
`;
}

function deliveryTemplate(id: string): string {
  return `---
spec-id: ${id}
version: 1.0.0
status: draft          # draft | completed
completed-at:
---

# 交付记录

## 实现方案

### 架构

### 关键代码逻辑

## 边界条件

| 场景 | 处理方式 | 验证结果 |
|------|----------|----------|

## 测试验证

### 测试策略声明

| 项目 | 说明 |
|------|------|
| 测试可行性 | |
| 测试替代方案 | |
| 单测要求 | |
| 覆盖率 | |
| 执行命令与结果 | |

## 代码评审

| 检查项 | 状态 | 备注 |
|--------|------|------|
| KISS | | 简单清晰，不过度设计 |
| 组织合理 | | 文件和目录有清晰边界 |
| 边界清晰 | | 职责明确，依赖关系合理 |
| 可读性 | | 人类和 AI 都能快速理解 |
| 注释有效 | | 解释契约或关键决策，不重复代码 |
| 复用 | | 优先成熟方案，不重复造轮子 |
| 测试 | | 已记录执行结果；未执行时说明原因 |

## 已知问题

## 回滚方案

## 变更文件
`;
}

function isMissingFileError(error: unknown): boolean {
  const unwrapped = unwrapErrorCause(error);
  if (unwrapped === null || typeof unwrapped !== 'object') return false;
  const code = (unwrapped as { readonly code?: unknown }).code;
  return code === 'ENOENT';
}

export { AgentPlanService as Plan };

registerScopedService(
  LifecycleScope.Agent,
  IAgentPlanService,
  AgentPlanService,
  InstantiationType.Eager,
  'plan',
);
