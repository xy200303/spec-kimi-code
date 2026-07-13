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

export interface SpecDocumentPaths {
  readonly root: string;
  readonly spec: string;
  readonly design: string;
}

export const REQUIRED_SPECIFICATION_SECTIONS = [
  'Goal',
  'Constraints',
  'Acceptance Criteria',
] as const;

export type RequiredSpecificationSection = (typeof REQUIRED_SPECIFICATION_SECTIONS)[number];

export interface SpecificationData {
  readonly path: string;
  readonly content: string;
  readonly missingSections: readonly RequiredSpecificationSection[];
}

export const REQUIRED_DESIGN_SECTIONS = ['Tasks', 'Risks', 'Verification'] as const;

export type RequiredDesignSection = (typeof REQUIRED_DESIGN_SECTIONS)[number];

export interface DesignData {
  readonly path: string;
  readonly content: string;
  readonly missingSections: readonly RequiredDesignSection[];
}

const SPEC_TEMPLATE = `# Specification

## Goal

## Constraints

## Acceptance Criteria
`;

const DESIGN_TEMPLATE = `# Design

## Tasks

## Risks

## Verification
`;

export class PlanMode {
  protected _isActive = false;
  protected _planId: null | string = null;
  protected _planFilePath: PlanFilePath = null;
  protected _specDocuments: SpecDocumentPaths | null = null;

  constructor(protected readonly agent: Agent) {}

  createPlanId(): string {
    return generateHeroSlug(randomUUID(), new Set());
  }

  async enter(id = this.createPlanId(), createFile = false, emitStatus = true): Promise<void> {
    if (this._isActive) {
      throw new Error('Already in plan mode');
    }

    this._isActive = true;
    this._planId = id;
    this._specDocuments = this.specDocumentsFor(id);
    this._planFilePath = this._specDocuments?.design ?? this.planFilePathFor(id);

    let enterRecorded = false;
    try {
      const planFilePath = this._planFilePath;
      if (planFilePath === null) throw new Error('Plan file path is unavailable');
      await this.ensurePlanDirectory(planFilePath);
      this.agent.records.logRecord({ type: 'plan_mode.enter', id });
      enterRecorded = true;
      if (this._specDocuments !== null) {
        await this.writeSpecTemplate(this._specDocuments.spec);
        await this.writeDesignTemplate(planFilePath);
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
    this._planFilePath = this._specDocuments?.design ?? this.planFilePathFor(id);
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
    return this._specDocuments === null
      ? [this._planFilePath]
      : [this._specDocuments.spec, this._specDocuments.design];
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

  async designData(): Promise<DesignData | null> {
    if (this._specDocuments === null) return null;
    const data = await this.data();
    if (data === null) return null;
    return {
      path: data.path,
      content: data.content,
      missingSections: missingDesignSections(data.content),
    };
  }

  private async writeEmptyPlanFile(path: string): Promise<void> {
    await this.ensurePlanDirectory(path);
    await this.agent.kaos.writeText(path, '');
  }

  private async writeSpecTemplate(path: string): Promise<void> {
    await this.agent.kaos.writeText(path, SPEC_TEMPLATE);
  }

  private async writeDesignTemplate(path: string): Promise<void> {
    await this.agent.kaos.writeText(path, DESIGN_TEMPLATE);
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
      design: join(root, 'design.md'),
    };
  }
}

export function missingSpecificationSections(
  content: string,
): readonly RequiredSpecificationSection[] {
  return missingMarkdownSections(content, REQUIRED_SPECIFICATION_SECTIONS);
}

export function missingDesignSections(content: string): readonly RequiredDesignSection[] {
  return missingMarkdownSections(content, REQUIRED_DESIGN_SECTIONS);
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
    return sectionContent.length === 0;
  });
}

function isMissingFileError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === 'ENOENT';
}
