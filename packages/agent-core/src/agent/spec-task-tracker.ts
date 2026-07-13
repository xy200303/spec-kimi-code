import type { ExecutableToolResult } from '../loop';
import {
  SPEC_TASK_ACTIVE_STORE_KEY,
  SPEC_TASK_STORE_KEY,
  SPEC_TASK_TRACE_STORE_KEY,
  type SpecTask,
  type SpecTaskTrace,
} from '../tools/builtin/state/spec-task-list';

import type { Agent } from '.';

const TRACEABLE_TOOL_NAMES = new Set(['Write', 'Edit', 'Bash', 'Agent', 'AgentSwarm']);

export interface SpecTaskToolResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: unknown;
  readonly result: ExecutableToolResult;
}

export class SpecTaskTracker {
  constructor(private readonly agent: Agent) {}

  recordToolResult(input: SpecTaskToolResult): void {
    if (!this.agent.experimentalFlags.enabled('spec-coding')) return;
    if (!TRACEABLE_TOOL_NAMES.has(input.toolName)) return;

    const taskId = this.activeTaskId();
    if (taskId === null) return;

    const tasks = this.tasks();
    const task = tasks.find((item) => item.id === taskId);
    if (task === undefined) return;

    const trace = this.traceFor(taskId, input);
    this.agent.tools.updateStore(SPEC_TASK_TRACE_STORE_KEY, [...this.traces(), trace]);

    if (input.result.isError !== true && trace.changedPaths !== undefined) {
      this.agent.tools.updateStore(
        SPEC_TASK_STORE_KEY,
        tasks.map((item) =>
          item.id === task.id
            ? { ...item, changedPaths: mergePaths(item.changedPaths, trace.changedPaths) }
            : item,
        ),
      );
    }
  }

  private activeTaskId(): string | null {
    const value = this.agent.tools.storeData()[SPEC_TASK_ACTIVE_STORE_KEY];
    return typeof value === 'string' ? value : null;
  }

  private tasks(): readonly SpecTask[] {
    const value = this.agent.tools.storeData()[SPEC_TASK_STORE_KEY];
    return Array.isArray(value) ? value.filter(isSpecTask) : [];
  }

  private traces(): readonly SpecTaskTrace[] {
    const value = this.agent.tools.storeData()[SPEC_TASK_TRACE_STORE_KEY];
    return Array.isArray(value) ? value.filter(isSpecTaskTrace) : [];
  }

  private traceFor(taskId: string, input: SpecTaskToolResult): SpecTaskTrace {
    const changedPaths = changedPathsFor(input.toolName, input.args);
    return {
      taskId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      outcome: input.result.isError === true ? 'failed' : 'succeeded',
      changedPaths,
      command: commandFor(input.toolName, input.args),
      delegation: delegationFor(input.toolName, input.args),
    };
  }
}

function changedPathsFor(toolName: string, args: unknown): readonly string[] | undefined {
  if (toolName !== 'Write' && toolName !== 'Edit') return undefined;
  const path = stringField(args, 'path');
  return path === undefined ? undefined : [path];
}

function commandFor(toolName: string, args: unknown): string | undefined {
  return toolName === 'Bash' ? stringField(args, 'command') : undefined;
}

function delegationFor(toolName: string, args: unknown): string | undefined {
  if (toolName !== 'Agent' && toolName !== 'AgentSwarm') return undefined;
  return stringField(args, 'description') ?? stringField(args, 'prompt');
}

function stringField(value: unknown, field: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function mergePaths(
  current: readonly string[] | undefined,
  additions: readonly string[],
): readonly string[] {
  return [...new Set([...(current ?? []), ...additions])];
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
