import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import type { ToolStore } from '../../store';
import DESCRIPTION from './spec-task-list.md?raw';

export const SPEC_TASK_LIST_TOOL_NAME = 'SpecTaskList' as const;
export const SPEC_TASK_STORE_KEY = 'specTasks' as const;

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

declare module '../../store' {
  interface ToolStoreData {
    specTasks: readonly SpecTask[];
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
}

export const SpecTaskListInputSchema: z.ZodType<SpecTaskListInput> = z
  .object({
    tasks: z
      .array(SpecTaskSchema)
      .refine(hasUniqueTaskIds, 'Task ids must be unique.')
      .optional()
      .describe('Full replacement task list. Omit to query the current task list.'),
  })
  .strict();

export class SpecTaskListTool implements BuiltinTool<SpecTaskListInput> {
  readonly name = SPEC_TASK_LIST_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SpecTaskListInputSchema);

  constructor(private readonly store: ToolStore) {}

  resolveExecution(args: SpecTaskListInput): ToolExecution {
    return {
      description: args.tasks === undefined ? 'Reading spec task list' : 'Updating spec task list',
      approvalRule: this.name,
      execute: async () => {
        if (args.tasks === undefined) {
          return { isError: false, output: renderSpecTasks(this.getTasks()) };
        }

        this.setTasks(args.tasks);
        return {
          isError: false,
          output: `Spec task list updated.\n${renderSpecTasks(this.getTasks())}`,
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
}

export function renderSpecTasks(tasks: readonly SpecTask[]): string {
  if (tasks.length === 0) return 'Spec task list is empty.';
  return ['Current spec tasks:', ...tasks.map(renderSpecTask)].join('\n');
}

function renderSpecTask(task: SpecTask): string {
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
