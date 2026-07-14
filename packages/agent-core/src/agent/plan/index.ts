import { randomUUID } from 'node:crypto';
import { dirname, join } from 'pathe';

import type { Agent } from '..';
import { generateHeroSlug } from '../../utils/hero-slug';

export type PlanData = null | {
  id: string;
  content: string;
  path: string;
};
export type PlanFilePath = string | null;

/**
 * Project-local spec run documents. A spec run is exactly two files —
 * `spec.md` (requirements + design + tasks) and `delivery.md` (delivery
 * record) — inside `specs/<name>/`. Additional design/ or notes/ files are
 * created by the agent on demand and need no code support.
 */
export interface SpecDocumentPaths {
  readonly root: string;
  readonly spec: string;
  readonly delivery: string;
}

export const REQUIRED_SPECIFICATION_SECTIONS = ['目标', '验收标准'] as const;

export type RequiredSpecificationSection = (typeof REQUIRED_SPECIFICATION_SECTIONS)[number];

export interface SpecificationData {
  readonly path: string;
  readonly content: string;
  readonly missingSections: readonly RequiredSpecificationSection[];
}

const SPEC_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

function specTemplate(id: string, date: string): string {
  return `---
id: ${id}
type: feature          # feature | bugfix | optimize | refactor | docs
status: in_progress    # pending | in_progress | done | cancelled
priority: p2           # p0 | p1 | p2 | p3
mode: standard         # prototype | standard | strict（直接执行的任务不写 spec）
author: user
created: ${date}
updated: ${date}
---

# <标题>

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

## 代码评审

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 注释完整 | | 关键逻辑有解释，不是每行都注释 |
| KISS | | 简单清晰，不过度设计 |
| 组织合理 | | 文件和目录有清晰边界 |
| 边界清晰 | | 职责明确，依赖关系合理 |
| 可读性 | | 人类和 AI 都能快速理解 |
| 复用 | | 优先成熟方案，不重复造轮子 |
| 测试 | | 有单测报覆盖率，无单测说明原因 |

## 已知问题

## 回滚方案

## 变更文件

| 文件 | 操作 | 行数 | 说明 |
|------|------|------|------|
`;
}

export class PlanMode {
  protected _isActive = false;
  protected _planId: null | string = null;
  protected _planFilePath: PlanFilePath = null;
  protected _specDocuments: SpecDocumentPaths | null = null;

  constructor(protected readonly agent: Agent) {}

  createPlanId(): string {
    return generateHeroSlug(randomUUID(), new Set());
  }

  /**
   * Resolve the spec run directory name: a valid semantic `name` wins;
   * otherwise fall back to a random hero slug. When `specs/<name>` already
   * exists, append `-2`, `-3`, … until free.
   */
  async resolveSpecRunId(name?: string): Promise<string> {
    if (name === undefined || !SPEC_NAME_PATTERN.test(name)) {
      return this.createPlanId();
    }
    if (!this.agent.experimentalFlags.enabled('spec-coding')) {
      return name;
    }
    let candidate = name;
    for (let suffix = 2; ; suffix++) {
      let exists = false;
      try {
        await this.agent.kaos.stat(join(this.agent.config.cwd, 'specs', candidate));
        exists = true;
      } catch {
        exists = false;
      }
      if (!exists) return candidate;
      candidate = `${name}-${suffix}`;
    }
  }

  async enter(id = this.createPlanId(), createFile = false, emitStatus = true): Promise<void> {
    if (this._isActive) {
      throw new Error('Already in plan mode');
    }

    this._isActive = true;
    this._planId = id;
    this._specDocuments = this.specDocumentsFor(id);
    this._planFilePath = this._specDocuments?.spec ?? this.planFilePathFor(id);

    let enterRecorded = false;
    try {
      const planFilePath = this._planFilePath;
      if (planFilePath === null) throw new Error('Plan file path is unavailable');
      await this.ensurePlanDirectory(planFilePath);
      this.agent.records.logRecord({ type: 'plan_mode.enter', id });
      enterRecorded = true;
      if (this._specDocuments !== null) {
        const date = new Date().toISOString().slice(0, 10);
        await this.agent.kaos.writeText(this._specDocuments.spec, specTemplate(id, date));
        await this.agent.kaos.writeText(this._specDocuments.delivery, deliveryTemplate(id));
      } else if (createFile) {
        await this.writeEmptyPlanFile(planFilePath);
      }
    } catch (error) {
      if (enterRecorded) {
        this.cancel(id);
      } else {
        this._isActive = false;
        this._planId = null;
        this._planFilePath = null;
        this._specDocuments = null;
      }
      throw error;
    }

    if (emitStatus) this.agent.emitStatusUpdated();
  }

  restoreEnter({ id }: { readonly id: string }): void {
    this.agent.replayBuilder.push({
      type: 'plan_updated',
      enabled: true,
    });

    this._isActive = true;
    this._planId = id;
    this._specDocuments = this.specDocumentsFor(id);
    this._planFilePath = this._specDocuments?.spec ?? this.planFilePathFor(id);
  }

  cancel(id?: string): void {
    this.agent.records.logRecord({ type: 'plan_mode.cancel', id });
    this.agent.replayBuilder.push({
      type: 'plan_updated',
      enabled: false,
    });
    this._isActive = false;
    this._planId = null;
    this._planFilePath = null;
    this._specDocuments = null;
    this.agent.emitStatusUpdated();
  }

  async clear(): Promise<void> {
    if (!this._planFilePath) return;
    await this.writeEmptyPlanFile(this._planFilePath);
  }

  exit(id?: string): void {
    this.agent.records.logRecord({ type: 'plan_mode.exit', id });
    this.agent.replayBuilder.push({
      type: 'plan_updated',
      enabled: false,
    });
    this._isActive = false;
    this._planId = null;
    this._planFilePath = null;
    this._specDocuments = null;
    this.agent.emitStatusUpdated();
  }

  get isActive() {
    return this._isActive;
  }

  get planFilePath(): PlanFilePath {
    return this._planFilePath;
  }

  get specDocuments(): SpecDocumentPaths | null {
    return this._specDocuments;
  }

  get writableFilePaths(): readonly string[] {
    if (this._planFilePath === null) return [];
    return this._specDocuments === null ? [this._planFilePath] : [this._specDocuments.spec];
  }

  async data(): Promise<PlanData> {
    if (!this._planId || !this._planFilePath) return null;
    let content = '';
    try {
      content = await this.agent.kaos.readText(this._planFilePath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    return {
      id: this._planId,
      content,
      path: this._planFilePath,
    };
  }

  async specificationData(): Promise<SpecificationData | null> {
    const path = this._specDocuments?.spec;
    if (path === undefined) return null;

    let content = '';
    try {
      content = await this.agent.kaos.readText(path);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    return {
      path,
      content,
      missingSections: missingSpecificationSections(content),
    };
  }

  private async writeEmptyPlanFile(path: string): Promise<void> {
    await this.ensurePlanDirectory(path);
    await this.agent.kaos.writeText(path, '');
  }

  private async ensurePlanDirectory(path: string): Promise<void> {
    await this.agent.kaos.mkdir(dirname(path), {
      parents: true,
      existOk: true,
    });
  }

  private planFilePathFor(id: string): string {
    const plansDir =
      this.agent.homedir === undefined
        ? join(this.agent.config.cwd, 'plan')
        : join(this.agent.homedir, 'plans');
    return join(plansDir, `${id}.md`);
  }

  private specDocumentsFor(id: string): SpecDocumentPaths | null {
    if (!this.agent.experimentalFlags.enabled('spec-coding')) return null;
    const root = join(this.agent.config.cwd, 'specs', id);
    return {
      root,
      spec: join(root, 'spec.md'),
      delivery: join(root, 'delivery.md'),
    };
  }
}

export function missingSpecificationSections(
  content: string,
): readonly RequiredSpecificationSection[] {
  return missingMarkdownSections(content, REQUIRED_SPECIFICATION_SECTIONS);
}

function missingMarkdownSections<T extends string>(
  content: string,
  sections: readonly T[],
): readonly T[] {
  const lines = content.split(/\r?\n/);
  return sections.filter((section) => {
    const headingIndex = lines.findIndex((line) => line.trim() === `## ${section}`);
    if (headingIndex === -1) return true;
    const nextHeadingIndex = lines.findIndex(
      (line, index) => index > headingIndex && /^##\s+/.test(line),
    );
    const sectionContent = lines
      .slice(headingIndex + 1, nextHeadingIndex === -1 ? undefined : nextHeadingIndex)
      .join('\n')
      .trim();
    // A checklist placeholder (`- [ ]`) or empty table alone does not count as
    // filled content.
    const meaningful = sectionContent
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return false;
        if (/^- \[ \]$/.test(trimmed)) return false;
        if (/^\|[\s|:-]*\|$/.test(trimmed)) return false;
        return true;
      })
      .join('\n')
      .trim();
    return meaningful.length === 0;
  });
}

function isMissingFileError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === 'ENOENT';
}
