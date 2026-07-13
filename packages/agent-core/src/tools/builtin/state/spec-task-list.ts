import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import type { ToolStore } from '../../store';
import DESCRIPTION from './spec-task-list.md?raw';

export const SPEC_TASK_LIST_TOOL_NAME = 'SpecTaskList' as const;
export const SPEC_TASK_STORE_KEY = 'specTasks' as const;
export const SPEC_TASK_ACTIVE_STORE_KEY = 'specTaskActive' as const;
export const SPEC_TASK_TRACE_STORE_KEY = 'specTaskTraces' as const;

export type SpecTaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked';
export type SpecTaskRisk = 'low' | 'medium' | 'high';

export interface SpecTask {
  readonly id: string;
  readonly title: string;
  readonly status: SpecTaskStatus;
  readonly reason: string;
  readonly risk?: SpecTaskRisk;
  readonly affectedPaths?: readonly string[];
  readonly changedPaths?: readonly string[];
  readonly evidence?: readonly string[];
}

export interface SpecTaskTrace {
  readonly taskId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly outcome: 'failed' | 'succeeded';
  readonly background?: boolean;
  readonly changedPaths?: readonly string[];
  readonly command?: string;
  readonly delegation?: string;
}

declare module '../../store' {
  interface ToolStoreData {
    specTasks: readonly SpecTask[];
    specTaskActive: string | null;
    specTaskTraces: readonly SpecTaskTrace[];
  }
}

const SpecTaskSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
    .describe('Stable lowercase task id, such as "task-validate-input".'),
  title: z.string().min(1).describe('Short, actionable task title.'),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked']),
  reason: z.string().min(1).describe('Why this task is necessary for the approved goal.'),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  affectedPaths: z
    .array(z.string().min(1))
    .optional()
    .describe('Files or path patterns expected to be affected.'),
  changedPaths: z
    .array(z.string().min(1))
    .optional()
    .describe('Files actually changed after executing the task.'),
  evidence: z
    .array(z.string().min(1))
    .optional()
    .describe('Verification commands, results, or review evidence for this task.'),
});

export interface SpecTaskListInput {
  tasks?: SpecTask[];
  activeTaskId?: string | null;
}

export const SpecTaskListInputSchema: z.ZodType<SpecTaskListInput> = z
  .object({
    tasks: z
      .array(SpecTaskSchema)
      .refine(hasUniqueTaskIds, 'Task ids must be unique.')
      .optional()
      .describe('Full replacement task list. Omit to query the current task list.'),
    activeTaskId: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .nullable()
      .optional()
      .describe('Current task id for automatic change tracing. Pass null to clear it.'),
  })
  .strict();

export class SpecTaskListTool implements BuiltinTool<SpecTaskListInput> {
  readonly name = SPEC_TASK_LIST_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SpecTaskListInputSchema);

  constructor(private readonly store: ToolStore) {}

  resolveExecution(args: SpecTaskListInput): ToolExecution {
    const isQuery = args.tasks === undefined && args.activeTaskId === undefined;
    return {
      description: isQuery ? 'Reading spec task list' : 'Updating spec task list',
      approvalRule: this.name,
      execute: async () => {
        const tasks = args.tasks ?? this.getTasks();
        if (args.tasks !== undefined) {
          this.setTasks(tasks);
        }

        let activeTaskId = this.getActiveTaskId();
        if (
          args.activeTaskId === undefined &&
          activeTaskId !== null &&
          !tasks.some((task) => task.id === activeTaskId)
        ) {
          this.setActiveTaskId(null);
          activeTaskId = null;
        }
        if (args.activeTaskId !== undefined) {
          if (args.activeTaskId !== null && !tasks.some((task) => task.id === args.activeTaskId)) {
            return {
              isError: true,
              output: `Unknown spec task id: ${args.activeTaskId}`,
            };
          }
          this.setActiveTaskId(args.activeTaskId);
          activeTaskId = args.activeTaskId;
        }

        const output = renderSpecTasks(tasks, activeTaskId, this.getTraces());
        if (isQuery) return { isError: false, output };
        return {
          isError: false,
          output: `Spec task list updated.\n${output}`,
        };
      },
    };
  }

  private getTasks(): readonly SpecTask[] {
    return this.store.get(SPEC_TASK_STORE_KEY) ?? [];
  }

  private setTasks(tasks: readonly SpecTask[]): void {
    this.store.set(SPEC_TASK_STORE_KEY, tasks.map(copyTask));
  }

  private getActiveTaskId(): string | null {
    return this.store.get(SPEC_TASK_ACTIVE_STORE_KEY) ?? null;
  }

  private setActiveTaskId(taskId: string | null): void {
    this.store.set(SPEC_TASK_ACTIVE_STORE_KEY, taskId);
  }

  private getTraces(): readonly SpecTaskTrace[] {
    return this.store.get(SPEC_TASK_TRACE_STORE_KEY) ?? [];
  }
}

export function renderSpecTasks(
  tasks: readonly SpecTask[],
  activeTaskId: string | null = null,
  traces: readonly SpecTaskTrace[] = [],
): string {
  if (tasks.length === 0) return 'Spec task list is empty.';
  const active = activeTaskId === null ? 'No active spec task.' : `Active spec task: ${activeTaskId}`;
  return ['Current spec tasks:', active, ...tasks.map((task) => renderSpecTask(task, traces))].join('\n');
}

function renderSpecTask(task: SpecTask, traces: readonly SpecTaskTrace[]): string {
  const lines = [
    `- [${task.status}] ${task.id}: ${task.title}`,
    `  Why: ${task.reason}`,
  ];
  if (task.risk !== undefined) lines.push(`  Risk: ${task.risk}`);
  if (task.affectedPaths !== undefined && task.affectedPaths.length > 0) {
    lines.push(`  Planned files: ${task.affectedPaths.join(', ')}`);
  }
  if (task.changedPaths !== undefined && task.changedPaths.length > 0) {
    lines.push(`  Changed files: ${task.changedPaths.join(', ')}`);
  }
  if (task.evidence !== undefined && task.evidence.length > 0) {
    lines.push(`  Evidence: ${task.evidence.join('; ')}`);
  }
  for (const trace of traces.filter((item) => item.taskId === task.id)) {
    lines.push(`  Trace: [${trace.outcome}] ${trace.toolName} (${trace.toolCallId})`);
    if (trace.changedPaths !== undefined && trace.changedPaths.length > 0) {
      lines.push(`    Changed files: ${trace.changedPaths.join(', ')}`);
    }
    if (trace.command !== undefined) lines.push(`    Command: ${trace.command}`);
    if (trace.delegation !== undefined) lines.push(`    Delegation: ${trace.delegation}`);
  }
  return lines.join('\n');
}

function copyTask(task: SpecTask): SpecTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    reason: task.reason,
    risk: task.risk,
    affectedPaths: task.affectedPaths?.map((path) => path),
    changedPaths: task.changedPaths?.map((path) => path),
    evidence: task.evidence?.map((item) => item),
  };
}

function hasUniqueTaskIds(tasks: readonly SpecTask[]): boolean {
  return new Set(tasks.map((task) => task.id)).size === tasks.length;
}
