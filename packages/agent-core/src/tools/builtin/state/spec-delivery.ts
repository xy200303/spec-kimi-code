import type { Agent } from '#/agent';
import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import { ToolAccesses } from '../../../loop/tool-access';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import type { ToolStore } from '../../store';
import {
  SPEC_TASK_STORE_KEY,
  SPEC_TASK_TRACE_STORE_KEY,
  type SpecTask,
  type SpecTaskTrace,
} from './spec-task-list';
import DESCRIPTION from './spec-delivery.md?raw';

export const SPEC_DELIVERY_TOOL_NAME = 'SpecDelivery' as const;
export const SPEC_DELIVERY_STORE_KEY = 'specDelivery' as const;

export type SpecQualityGate = 'fast' | 'standard' | 'strict' | 'release';
export type SpecDevelopmentStrategy =
  | 'planning'
  | 'agile_mvp'
  | 'controlled_feature'
  | 'bug_diagnosis'
  | 'refactor'
  | 'review'
  | 'release'
  | 'research';

export interface SpecStrategyDecision {
  readonly strategy: SpecDevelopmentStrategy;
  readonly recommendedQualityGate: SpecQualityGate;
  readonly reasons: readonly string[];
}

export interface SpecApprovedSnapshot {
  readonly specification: string;
  readonly design: string;
}

export type SpecEvidenceKind =
  | 'validation'
  | 'tests'
  | 'typecheck_or_build'
  | 'lint_or_format'
  | 'diff_review'
  | 'critical_path'
  | 'edge_cases'
  | 'release_build'
  | 'release_notes';

export interface SpecDeliveryContext {
  readonly root: string;
  readonly spec: string;
  readonly design: string;
  readonly delivery: string;
  readonly qualityGate: SpecQualityGate;
  readonly strategy?: SpecStrategyDecision;
  readonly approved?: SpecApprovedSnapshot;
}

export interface SpecEvidence {
  readonly kind: SpecEvidenceKind;
  readonly detail: string;
  readonly toolCallId: string;
}

declare module '../../store' {
  interface ToolStoreData {
    specDelivery: SpecDeliveryContext | null;
  }
}

const SpecEvidenceSchema = z
  .object({
    kind: z.enum([
      'validation',
      'tests',
      'typecheck_or_build',
      'lint_or_format',
      'diff_review',
      'critical_path',
      'edge_cases',
      'release_build',
      'release_notes',
    ]),
    detail: z.string().trim().min(1).describe('Command or observation that proves this evidence.'),
    toolCallId: z
      .string()
      .trim()
      .min(1)
      .describe('Successful foreground Bash tool call that produced this evidence.'),
  })
  .strict();

const NoteListSchema = z.array(z.string().trim().min(1));

export const SpecDeliveryInputSchema = z
  .object({
    evidence: z
      .array(SpecEvidenceSchema)
      .refine(hasUniqueEvidenceKinds, 'Evidence kinds must be unique.')
      .optional()
      .describe('Evidence collected for the selected quality gate, each linked to a Bash tool call.'),
    decisions: NoteListSchema.optional().describe('Implementation decisions to retain in the record.'),
    risks: NoteListSchema.optional().describe('Residual risks after implementation.'),
    openQuestions: NoteListSchema.optional().describe('Questions that remain unresolved.'),
    rollbackNotes: NoteListSchema.optional().describe('How to revert or mitigate this delivery.'),
    complete: z
      .boolean()
      .optional()
      .describe('Set true only to mark the delivery complete after all quality checks pass.'),
  })
  .strict();

export type SpecDeliveryInput = z.infer<typeof SpecDeliveryInputSchema>;

const QUALITY_GATE_EVIDENCE: Readonly<Record<SpecQualityGate, readonly SpecEvidenceKind[]>> = {
  fast: ['validation', 'diff_review'],
  standard: ['tests', 'typecheck_or_build', 'lint_or_format', 'diff_review'],
  strict: [
    'tests',
    'typecheck_or_build',
    'lint_or_format',
    'diff_review',
    'critical_path',
    'edge_cases',
  ],
  release: [
    'tests',
    'typecheck_or_build',
    'lint_or_format',
    'diff_review',
    'critical_path',
    'edge_cases',
    'release_build',
    'release_notes',
  ],
};

const EVIDENCE_LABELS: Readonly<Record<SpecEvidenceKind, string>> = {
  validation: 'Relevant validation',
  tests: 'Relevant tests',
  typecheck_or_build: 'Typecheck or build',
  lint_or_format: 'Lint or format check',
  diff_review: 'Diff review',
  critical_path: 'Critical-path verification',
  edge_cases: 'Edge-case verification',
  release_build: 'Release build or package verification',
  release_notes: 'Release-note review',
};

export class SpecDeliveryTool implements BuiltinTool<SpecDeliveryInput> {
  readonly name = SPEC_DELIVERY_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SpecDeliveryInputSchema);

  constructor(private readonly agent: Agent, private readonly store: ToolStore) {}

  resolveExecution(args: SpecDeliveryInput): ToolExecution {
    const context = this.context();
    return {
      accesses: context === null ? undefined : ToolAccesses.writeFile(context.delivery),
      description:
        args.complete === true ? 'Completing spec delivery record' : 'Writing spec delivery record',
      approvalRule: this.name,
      execute: () => this.execution(args),
    };
  }

  private async execution(args: SpecDeliveryInput): Promise<ExecutableToolResult> {
    const context = this.context();
    if (context === null) {
      return {
        isError: true,
        output: 'No spec delivery record is available. Enter spec plan mode before creating a delivery record.',
      };
    }

    const tasks = this.tasks();
    const traces = this.traces();
    const evidence = args.evidence ?? [];
    const incompleteTasks = tasks.filter((task) => task.status !== 'done');
    const missingEvidence = missingEvidenceKinds(context.qualityGate, evidence);
    const unverifiedEvidence = unverifiedEvidenceReferences(evidence, traces);
    if (
      args.complete === true &&
      (tasks.length === 0 ||
        incompleteTasks.length > 0 ||
        missingEvidence.length > 0 ||
        unverifiedEvidence.length > 0)
    ) {
      return {
        isError: true,
        output: completionBlocker(tasks, incompleteTasks, missingEvidence, unverifiedEvidence),
      };
    }

    const documents = await this.documents(context);
    if (documents instanceof Error) {
      return { isError: true, output: `Failed to read spec documents: ${documents.message}` };
    }

    const content = renderDeliveryRecord({
      context,
      ...documents,
      tasks,
      traces,
      evidence,
      decisions: args.decisions ?? [],
      risks: args.risks ?? [],
      openQuestions: args.openQuestions ?? [],
      rollbackNotes: args.rollbackNotes ?? [],
      complete: args.complete === true,
    });
    try {
      await this.agent.kaos.writeText(context.delivery, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, output: `Failed to write delivery record: ${message}` };
    }
    return {
      output: `${args.complete === true ? 'Completed' : 'Updated'} delivery record: ${context.delivery}`,
    };
  }

  private context(): SpecDeliveryContext | null {
    const value = this.store.get(SPEC_DELIVERY_STORE_KEY);
    return isSpecDeliveryContext(value) ? value : null;
  }

  private tasks(): readonly SpecTask[] {
    const value = this.store.get(SPEC_TASK_STORE_KEY);
    return Array.isArray(value) ? value.filter(isSpecTask) : [];
  }

  private traces(): readonly SpecTaskTrace[] {
    const value = this.store.get(SPEC_TASK_TRACE_STORE_KEY);
    return Array.isArray(value) ? value.filter(isSpecTaskTrace) : [];
  }

  private async documents(
    context: SpecDeliveryContext,
  ): Promise<SpecApprovedSnapshot | Error> {
    if (context.approved !== undefined) return context.approved;
    try {
      const [specification, design] = await Promise.all([
        this.agent.kaos.readText(context.spec),
        this.agent.kaos.readText(context.design),
      ]);
      return { specification, design };
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }
}

function missingEvidenceKinds(
  qualityGate: SpecQualityGate,
  evidence: readonly SpecEvidence[],
): readonly SpecEvidenceKind[] {
  const present = new Set(evidence.map((item) => item.kind));
  return QUALITY_GATE_EVIDENCE[qualityGate].filter((kind) => !present.has(kind));
}

function hasUniqueEvidenceKinds(evidence: readonly SpecEvidence[]): boolean {
  return new Set(evidence.map((item) => item.kind)).size === evidence.length;
}

function unverifiedEvidenceReferences(
  evidence: readonly SpecEvidence[],
  traces: readonly SpecTaskTrace[],
): readonly SpecEvidence[] {
  return evidence.filter((item) => successfulForegroundBashTrace(item, traces) === undefined);
}

function completionBlocker(
  tasks: readonly SpecTask[],
  incompleteTasks: readonly SpecTask[],
  missingEvidence: readonly SpecEvidenceKind[],
  unverifiedEvidence: readonly SpecEvidence[],
): string {
  const lines = ['Delivery cannot be marked complete.'];
  if (tasks.length === 0) lines.push('No spec tasks have been recorded.');
  if (incompleteTasks.length > 0) {
    lines.push(`Incomplete spec tasks: ${incompleteTasks.map((task) => task.id).join(', ')}`);
  }
  if (missingEvidence.length > 0) {
    lines.push(
      `Missing quality-gate evidence: ${missingEvidence.map((kind) => EVIDENCE_LABELS[kind]).join(', ')}`,
    );
  }
  if (unverifiedEvidence.length > 0) {
    lines.push(
      `Unverified evidence references: ${unverifiedEvidence.map(formatEvidenceReference).join(', ')}`,
    );
  }
  return lines.join('\n');
}

interface DeliveryRecordInput {
  readonly context: SpecDeliveryContext;
  readonly specification: string;
  readonly design: string;
  readonly tasks: readonly SpecTask[];
  readonly traces: readonly SpecTaskTrace[];
  readonly evidence: readonly SpecEvidence[];
  readonly decisions: readonly string[];
  readonly risks: readonly string[];
  readonly openQuestions: readonly string[];
  readonly rollbackNotes: readonly string[];
  readonly complete: boolean;
}

function renderDeliveryRecord(input: DeliveryRecordInput): string {
  const changes = changedPaths(input.tasks, input.traces);
  const designRisks = markdownSection(input.design, 'Risks');
  return `# Delivery Record

## Quality Gate

${input.context.qualityGate}

## Development Strategy

${renderStrategy(input.context.strategy)}

## Status

${input.complete ? 'Complete' : 'Draft'}

## Goal

${markdownSection(input.specification, 'Goal') || 'Not recorded.'}

## Constraints

${markdownSection(input.specification, 'Constraints') || 'Not recorded.'}

## Acceptance Criteria

${markdownSection(input.specification, 'Acceptance Criteria') || 'Not recorded.'}

## Plan

Source design: \`${input.context.design}\`

${markdownSection(input.design, 'Tasks') || 'Not recorded.'}

## Tasks

${renderTasks(input.tasks)}

## Changes

${renderList(changes, 'No file changes recorded.')}

## Evidence

${renderEvidence(input.context.qualityGate, input.evidence, input.traces)}

## Decisions

${renderList(input.decisions, 'No decisions recorded.')}

## Risks

${designRisks || 'No risks recorded.'}
${input.risks.length > 0 ? `\n\nAdditional residual risks:\n${renderList(input.risks, '')}` : ''}

## Open Questions

${renderList(input.openQuestions, 'No open questions recorded.')}

## Rollback Notes

${renderList(input.rollbackNotes, 'No rollback notes recorded.')}
`;
}

export function markdownSection(content: string, title: string): string {
  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (headingIndex === -1) return '';
  const nextHeadingIndex = lines.findIndex(
    (line, index) => index > headingIndex && /^##\s+/.test(line),
  );
  return lines
    .slice(headingIndex + 1, nextHeadingIndex === -1 ? undefined : nextHeadingIndex)
    .join('\n')
    .trim();
}

function renderTasks(tasks: readonly SpecTask[]): string {
  if (tasks.length === 0) return 'No spec tasks recorded.';
  return tasks
    .map((task) => {
      const details = [
        `- [${task.status}] ${task.id}: ${task.title}`,
        `  Reason: ${task.reason}`,
        ...(task.risk === undefined ? [] : [`  Risk: ${task.risk}`]),
        ...(task.affectedPaths === undefined || task.affectedPaths.length === 0
          ? []
          : [`  Planned files: ${task.affectedPaths.join(', ')}`]),
        ...(task.changedPaths === undefined || task.changedPaths.length === 0
          ? []
          : [`  Changed files: ${task.changedPaths.join(', ')}`]),
      ];
      return details.join('\n');
    })
    .join('\n');
}

function renderStrategy(strategy: SpecStrategyDecision | undefined): string {
  if (strategy === undefined) return 'Not routed.';
  return [
    `Selected: ${strategy.strategy}`,
    `Recommended quality gate: ${strategy.recommendedQualityGate}`,
    'Reasons:',
    ...strategy.reasons.map((reason) => `- ${reason}`),
  ].join('\n');
}

function changedPaths(
  tasks: readonly SpecTask[],
  traces: readonly SpecTaskTrace[],
): readonly string[] {
  return [
    ...new Set([
      ...tasks.flatMap((task) => task.changedPaths ?? []),
      ...traces.flatMap((trace) => trace.changedPaths ?? []),
    ]),
  ];
}

function renderEvidence(
  qualityGate: SpecQualityGate,
  evidence: readonly SpecEvidence[],
  traces: readonly SpecTaskTrace[],
): string {
  const checklist = QUALITY_GATE_EVIDENCE[qualityGate].map((kind) => {
    const item = evidence.find((candidate) => candidate.kind === kind);
    if (item === undefined) return `- [ ] ${EVIDENCE_LABELS[kind]}`;
    const trace = successfulForegroundBashTrace(item, traces);
    return trace === undefined
      ? `- [ ] ${EVIDENCE_LABELS[kind]}: ${item.detail} (${formatEvidenceReference(item)})`
      : `- [x] ${EVIDENCE_LABELS[kind]}: ${item.detail} (${formatEvidenceReference(item)}; ${trace.command})`;
  });
  const commands = traces
    .filter((trace) => trace.command !== undefined)
    .map((trace) => `- [${trace.outcome}] ${trace.command}`);
  return [...checklist, ...commands].join('\n');
}

function successfulForegroundBashTrace(
  evidence: SpecEvidence,
  traces: readonly SpecTaskTrace[],
): SpecTaskTrace | undefined {
  return traces.find(
    (trace) =>
      trace.toolCallId === evidence.toolCallId &&
      trace.toolName === 'Bash' &&
      trace.outcome === 'succeeded' &&
      trace.background !== true &&
      trace.command !== undefined,
  );
}

function formatEvidenceReference(evidence: SpecEvidence): string {
  return `tool call ${evidence.toolCallId}`;
}

function renderList(items: readonly string[], empty: string): string {
  return items.length === 0 ? empty : items.map((item) => `- ${item}`).join('\n');
}

export function isSpecDeliveryContext(value: unknown): value is SpecDeliveryContext {
  if (value === null || typeof value !== 'object') return false;
  const context = value as Record<string, unknown>;
  return (
    typeof context['root'] === 'string' &&
    typeof context['spec'] === 'string' &&
    typeof context['design'] === 'string' &&
    typeof context['delivery'] === 'string' &&
    (context['approved'] === undefined || isSpecApprovedSnapshot(context['approved'])) &&
    (context['strategy'] === undefined || isSpecStrategyDecision(context['strategy'])) &&
    (context['qualityGate'] === 'fast' ||
      context['qualityGate'] === 'standard' ||
      context['qualityGate'] === 'strict' ||
      context['qualityGate'] === 'release')
  );
}

function isSpecApprovedSnapshot(value: unknown): value is SpecApprovedSnapshot {
  if (value === null || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot['specification'] === 'string' && typeof snapshot['design'] === 'string';
}

function isSpecStrategyDecision(value: unknown): value is SpecStrategyDecision {
  if (value === null || typeof value !== 'object') return false;
  const strategy = value as Record<string, unknown>;
  return (
    (strategy['strategy'] === 'planning' ||
      strategy['strategy'] === 'agile_mvp' ||
      strategy['strategy'] === 'controlled_feature' ||
      strategy['strategy'] === 'bug_diagnosis' ||
      strategy['strategy'] === 'refactor' ||
      strategy['strategy'] === 'review' ||
      strategy['strategy'] === 'release' ||
      strategy['strategy'] === 'research') &&
    (strategy['recommendedQualityGate'] === 'fast' ||
      strategy['recommendedQualityGate'] === 'standard' ||
      strategy['recommendedQualityGate'] === 'strict' ||
      strategy['recommendedQualityGate'] === 'release') &&
    Array.isArray(strategy['reasons']) &&
    strategy['reasons'].every((reason) => typeof reason === 'string')
  );
}

function isSpecTask(value: unknown): value is SpecTask {
  if (value === null || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task['id'] === 'string' &&
    typeof task['title'] === 'string' &&
    typeof task['reason'] === 'string' &&
    (task['status'] === 'pending' ||
      task['status'] === 'in_progress' ||
      task['status'] === 'done' ||
      task['status'] === 'blocked')
  );
}

function isSpecTaskTrace(value: unknown): value is SpecTaskTrace {
  if (value === null || typeof value !== 'object') return false;
  const trace = value as Record<string, unknown>;
  return (
    typeof trace['taskId'] === 'string' &&
    typeof trace['toolCallId'] === 'string' &&
    typeof trace['toolName'] === 'string' &&
    (trace['outcome'] === 'succeeded' || trace['outcome'] === 'failed')
  );
}
