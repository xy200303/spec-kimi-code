import type { Agent } from '#/agent';
import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import { ToolAccesses } from '../../../loop/tool-access';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import type { ToolStore } from '../../store';
import {
  SPEC_TASK_ACTIVE_STORE_KEY,
  SPEC_TASK_STORE_KEY,
  SPEC_TASK_TRACE_STORE_KEY,
  type SpecTaskCategory,
  type SpecTask,
  type SpecTaskTrace,
} from './spec-task-list';
import { SPEC_DELIVERY_STORE_KEY } from './spec-run-state';
import DESCRIPTION from './spec-delivery.md?raw';

export const SPEC_DELIVERY_TOOL_NAME = 'SpecDelivery' as const;
export { SPEC_DELIVERY_STORE_KEY } from './spec-run-state';

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
  readonly requiredTaskCategories: readonly SpecTaskCategory[];
  readonly reasons: readonly string[];
}

export interface SpecApprovalRecord {
  readonly source: 'auto' | 'user';
  readonly approvedAt: string;
  readonly selectedOption?: string;
}

export interface SpecApprovedSnapshot {
  readonly specification: string;
  readonly design: string;
  readonly approval?: SpecApprovalRecord;
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
  readonly deliveryJson: string;
  readonly qualityGate: SpecQualityGate;
  readonly strategy?: SpecStrategyDecision;
  readonly approved?: SpecApprovedSnapshot;
  readonly finalizedAt?: string;
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
      accesses:
        context === null
          ? undefined
          : [...ToolAccesses.writeFile(context.delivery), ...ToolAccesses.writeFile(context.deliveryJson)],
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
    const approved = context.approved;
    if (approved?.approval === undefined) {
      return {
        isError: true,
        output: 'No approved spec run is available. Complete and approve spec plan mode first.',
      };
    }
    if (context.finalizedAt !== undefined) {
      return {
        isError: true,
        output: `Delivery records were finalized at ${context.finalizedAt}. Start a new spec run to record further changes.`,
      };
    }

    const tasks = this.tasks();
    const traces = this.traces();
    const evidence = args.evidence ?? [];
    const incompleteTasks = tasks.filter((task) => task.status !== 'done');
    const missingEvidence = missingEvidenceKinds(context.qualityGate, evidence);
    const missingTaskCategories = missingTaskCategoriesForStrategy(context.strategy, tasks);
    const unverifiedEvidence = unverifiedEvidenceReferences(evidence, tasks, traces);
    if (
      args.complete === true &&
      (tasks.length === 0 ||
        incompleteTasks.length > 0 ||
        missingEvidence.length > 0 ||
        missingTaskCategories.length > 0 ||
        unverifiedEvidence.length > 0)
    ) {
      return {
        isError: true,
        output: completionBlocker(
          tasks,
          incompleteTasks,
          missingEvidence,
          missingTaskCategories,
          unverifiedEvidence,
        ),
      };
    }

    const documents = approved;

    const finalizedAt = args.complete === true ? new Date().toISOString() : undefined;
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
      finalizedAt,
    });
    const manifest = renderDeliveryManifest({
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
      finalizedAt,
    });
    try {
      await Promise.all([
        this.agent.kaos.writeText(context.delivery, content),
        this.agent.kaos.writeText(context.deliveryJson, manifest),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, output: `Failed to write delivery record: ${message}` };
    }
    if (finalizedAt !== undefined) {
      this.store.set(SPEC_DELIVERY_STORE_KEY, { ...context, finalizedAt });
      this.store.set(SPEC_TASK_ACTIVE_STORE_KEY, null);
    }
    return {
      output:
        args.complete === true
          ? `Completed delivery records at ${finalizedAt}: ${context.delivery}, ${context.deliveryJson}`
          : `Updated delivery records: ${context.delivery}, ${context.deliveryJson}`,
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
  tasks: readonly SpecTask[],
  traces: readonly SpecTaskTrace[],
): readonly SpecEvidence[] {
  return evidence.filter((item) => verifiedEvidenceTrace(item, tasks, traces) === undefined);
}

function verifiedEvidenceTrace(
  evidence: SpecEvidence,
  tasks: readonly SpecTask[],
  traces: readonly SpecTaskTrace[],
): SpecTaskTrace | undefined {
  const trace = successfulForegroundBashTrace(evidence, traces);
  return trace !== undefined && isCompletedTaskTrace(trace, tasks) ? trace : undefined;
}

function isCompletedTaskTrace(trace: SpecTaskTrace, tasks: readonly SpecTask[]): boolean {
  return tasks.some((task) => task.id === trace.taskId && task.status === 'done');
}

function missingTaskCategoriesForStrategy(
  strategy: SpecStrategyDecision | undefined,
  tasks: readonly SpecTask[],
): readonly SpecTaskCategory[] {
  if (strategy === undefined) return [];
  const completedCategories = new Set(
    tasks.filter((task) => task.status === 'done').map((task) => task.category),
  );
  return strategy.requiredTaskCategories.filter((category) => !completedCategories.has(category));
}

function completionBlocker(
  tasks: readonly SpecTask[],
  incompleteTasks: readonly SpecTask[],
  missingEvidence: readonly SpecEvidenceKind[],
  missingTaskCategories: readonly SpecTaskCategory[],
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
  if (missingTaskCategories.length > 0) {
    lines.push(`Missing strategy task categories: ${missingTaskCategories.join(', ')}`);
  }
  if (unverifiedEvidence.length > 0) {
    lines.push(
      `Unverified evidence references: ${unverifiedEvidence.map(formatEvidenceReference).join(', ')}. ` +
        'Evidence must belong to completed spec tasks.',
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
  readonly finalizedAt?: string;
}

interface DeliveryChangeRecord {
  readonly path: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly reason: string;
  readonly risk?: SpecTask['risk'];
  readonly category?: SpecTask['category'];
  readonly toolCallIds: readonly string[];
}

function renderDeliveryRecord(input: DeliveryRecordInput): string {
  const designRisks = markdownSection(input.design, 'Risks');
  return `# Delivery Record

## Quality Gate

${input.context.qualityGate}

## Development Strategy

${renderStrategy(input.context.strategy)}

## Approval

${renderApproval(input.context.approved?.approval)}

## Status

${input.complete ? 'Complete' : 'Draft'}
${input.finalizedAt === undefined ? '' : `
Finalized at: ${input.finalizedAt}`}

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

## Activity

${renderActivity(input.tasks, input.traces)}

## Changes

${renderChanges(input.tasks, input.traces)}

## Evidence

${renderEvidence(input.context.qualityGate, input.evidence, input.tasks, input.traces)}

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

function renderDeliveryManifest(input: DeliveryRecordInput): string {
  const plannedRisks = markdownSection(input.design, 'Risks');
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      status: input.complete ? 'complete' : 'draft',
      finalizedAt: input.finalizedAt,
      documents: {
        specification: input.context.spec,
        design: input.context.design,
        deliveryMarkdown: input.context.delivery,
        deliveryJson: input.context.deliveryJson,
      },
      qualityGate: input.context.qualityGate,
      strategy: input.context.strategy,
      approval: input.context.approved?.approval,
      goal: markdownSection(input.specification, 'Goal'),
      constraints: markdownSection(input.specification, 'Constraints'),
      acceptanceCriteria: markdownSection(input.specification, 'Acceptance Criteria'),
      plan: markdownSection(input.design, 'Tasks'),
      plannedRisks,
      tasks: input.tasks,
      activity: input.traces,
      changes: collectChanges(input.tasks, input.traces),
      evidence: input.evidence,
      decisions: input.decisions,
      residualRisks: input.risks,
      openQuestions: input.openQuestions,
      rollbackNotes: input.rollbackNotes,
    },
    null,
    2,
  )}\n`;
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
        ...(task.category === undefined ? [] : [`  Category: ${task.category}`]),
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
    `Required task categories: ${strategy.requiredTaskCategories.join(', ') || 'None'}`,
    'Reasons:',
    ...strategy.reasons.map((reason) => `- ${reason}`),
  ].join('\n');
}

function renderApproval(approval: SpecApprovalRecord | undefined): string {
  if (approval === undefined) return 'Not recorded.';
  return [
    `Source: ${approval.source}`,
    `Approved at: ${approval.approvedAt}`,
    ...(approval.selectedOption === undefined ? [] : [`Selected option: ${approval.selectedOption}`]),
  ].join('\n');
}

function renderChanges(
  tasks: readonly SpecTask[],
  traces: readonly SpecTaskTrace[],
): string {
  const changes = collectChanges(tasks, traces);
  return changes.length === 0
    ? 'No file changes recorded.'
    : changes
        .map((change) =>
          [
            `- \`${change.path}\``,
            `  Task: ${change.taskId} — ${change.taskTitle}`,
            `  Reason: ${change.reason}`,
            ...(change.risk === undefined ? [] : [`  Risk: ${change.risk}`]),
            ...(change.category === undefined ? [] : [`  Category: ${change.category}`]),
            ...(change.toolCallIds.length === 0
              ? []
              : [`  Tool calls: ${change.toolCallIds.join(', ')}`]),
          ].join('\n'),
        )
        .join('\n');
}

function renderActivity(tasks: readonly SpecTask[], traces: readonly SpecTaskTrace[]): string {
  if (traces.length === 0) return 'No tool activity recorded.';
  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
  return traces
    .map((trace) => {
      const lines = [
        `- [${trace.outcome}] ${trace.toolName} (${trace.toolCallId})`,
        `  Task: ${trace.taskId}${taskTitles.has(trace.taskId) ? ` — ${taskTitles.get(trace.taskId)}` : ''}`,
      ];
      if (trace.command !== undefined) lines.push(`  Command: ${trace.command}`);
      if (trace.delegation !== undefined) lines.push(`  Delegation: ${trace.delegation}`);
      if (trace.changedPaths !== undefined && trace.changedPaths.length > 0) {
        lines.push(`  Changed files: ${trace.changedPaths.join(', ')}`);
      }
      if (trace.background === true) lines.push('  Background: true');
      return lines.join('\n');
    })
    .join('\n');
}

function collectChanges(
  tasks: readonly SpecTask[],
  traces: readonly SpecTaskTrace[],
): readonly DeliveryChangeRecord[] {
  return tasks.flatMap((task) => changesForTask(task, traces));
}

function changesForTask(
  task: SpecTask,
  traces: readonly SpecTaskTrace[],
): readonly DeliveryChangeRecord[] {
  const taskTraces = traces.filter((trace) => trace.taskId === task.id);
  const paths = [
    ...new Set([
      ...(task.changedPaths ?? []),
      ...taskTraces.flatMap((trace) => trace.changedPaths ?? []),
    ]),
  ];
  const toolCalls = taskTraces.map((trace) => `${trace.toolName} (${trace.toolCallId})`);
  return paths.map((path) => ({
    path,
    taskId: task.id,
    taskTitle: task.title,
    reason: task.reason,
    risk: task.risk,
    category: task.category,
    toolCallIds: toolCalls,
  }));
}

function renderEvidence(
  qualityGate: SpecQualityGate,
  evidence: readonly SpecEvidence[],
  tasks: readonly SpecTask[],
  traces: readonly SpecTaskTrace[],
): string {
  const checklist = QUALITY_GATE_EVIDENCE[qualityGate].map((kind) => {
    const item = evidence.find((candidate) => candidate.kind === kind);
    if (item === undefined) return `- [ ] ${EVIDENCE_LABELS[kind]}`;
    const trace = verifiedEvidenceTrace(item, tasks, traces);
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
    typeof context['deliveryJson'] === 'string' &&
    (context['finalizedAt'] === undefined || typeof context['finalizedAt'] === 'string') &&
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
  return (
    typeof snapshot['specification'] === 'string' &&
    typeof snapshot['design'] === 'string' &&
    (snapshot['approval'] === undefined || isSpecApprovalRecord(snapshot['approval']))
  );
}

function isSpecApprovalRecord(value: unknown): value is SpecApprovalRecord {
  if (value === null || typeof value !== 'object') return false;
  const approval = value as Record<string, unknown>;
  return (
    (approval['source'] === 'auto' || approval['source'] === 'user') &&
    typeof approval['approvedAt'] === 'string' &&
    (approval['selectedOption'] === undefined || typeof approval['selectedOption'] === 'string')
  );
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
    Array.isArray(strategy['requiredTaskCategories']) &&
    strategy['requiredTaskCategories'].every(isSpecTaskCategory) &&
    Array.isArray(strategy['reasons']) &&
    strategy['reasons'].every((reason) => typeof reason === 'string')
  );
}

function isSpecTaskCategory(value: unknown): value is SpecTaskCategory {
  return (
    value === 'scope_validation' ||
    value === 'impact_analysis' ||
    value === 'behavioral_verification' ||
    value === 'reproduction' ||
    value === 'root_cause' ||
    value === 'regression_test' ||
    value === 'behavior_preservation' ||
    value === 'review_findings' ||
    value === 'diff_review' ||
    value === 'release_build' ||
    value === 'release_notes' ||
    value === 'research_summary' ||
    value === 'planning_review'
  );
}

function isSpecTask(value: unknown): value is SpecTask {
  if (value === null || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task['id'] === 'string' &&
    typeof task['title'] === 'string' &&
    typeof task['reason'] === 'string' &&
    (task['category'] === undefined || isSpecTaskCategory(task['category'])) &&
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
