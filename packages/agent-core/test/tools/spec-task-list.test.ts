import { describe, expect, it } from 'vitest';

import {
  SPEC_TASK_ACTIVE_STORE_KEY,
  SPEC_TASK_LIST_TOOL_NAME,
  SPEC_TASK_STORE_KEY,
  SPEC_TASK_TRACE_STORE_KEY,
  SpecTaskListInputSchema,
  SpecTaskListTool,
  type SpecTask,
  type SpecTaskTrace,
} from '../../src/tools/builtin/state/spec-task-list';
import {
  SPEC_DELIVERY_STORE_KEY,
  type SpecDeliveryContext,
} from '../../src/tools/builtin/state/spec-delivery';
import type { ToolStore } from '../../src/tools/store';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;

function makeTool(initial: readonly SpecTask[] = [], finalizedAt?: string): {
  tool: SpecTaskListTool;
  getTasks(): readonly SpecTask[];
  setTraces(traces: readonly SpecTaskTrace[]): void;
} {
  let tasks = [...initial];
  let activeTaskId: string | null = null;
  let traces: readonly SpecTaskTrace[] = [];
  const deliveryContext: SpecDeliveryContext | null =
    finalizedAt === undefined
      ? null
      : {
          root: '/workspace/specs/finalized-run',
          spec: '/workspace/specs/finalized-run/spec.md',
          design: '/workspace/specs/finalized-run/design.md',
          delivery: '/workspace/specs/finalized-run/delivery.md',
          deliveryJson: '/workspace/specs/finalized-run/delivery.json',
          qualityGate: 'standard',
          finalizedAt,
        };
  const store: ToolStore = {
    get: (key) => {
      const value =
        key === SPEC_TASK_STORE_KEY
          ? tasks
          : key === SPEC_TASK_TRACE_STORE_KEY
            ? traces
            : key === SPEC_DELIVERY_STORE_KEY
              ? deliveryContext
              : key === SPEC_TASK_ACTIVE_STORE_KEY
                ? activeTaskId
                : undefined;
      return value as never;
    },
    set: (key, value) => {
      if (key === SPEC_TASK_STORE_KEY) {
        tasks = [...(value as readonly SpecTask[])];
      } else if (key === SPEC_TASK_TRACE_STORE_KEY) {
        traces = [...(value as readonly SpecTaskTrace[])];
      } else if (key === SPEC_TASK_ACTIVE_STORE_KEY) {
        activeTaskId = value as string | null;
      }
    },
  };
  return {
    tool: new SpecTaskListTool(store),
    getTasks: () => tasks,
    setTraces: (traces) => store.set(SPEC_TASK_TRACE_STORE_KEY, traces),
  };
}

describe('SpecTaskListTool', () => {
  it('exposes a structured replacement schema', () => {
    const { tool } = makeTool();

    expect(SPEC_TASK_LIST_TOOL_NAME).toBe('SpecTaskList');
    expect(SPEC_TASK_STORE_KEY).toBe('specTasks');
    expect(SpecTaskListInputSchema.safeParse({}).success).toBe(true);
    expect(
      SpecTaskListInputSchema.safeParse({ activeTaskId: 'task-validate-input' }).success,
    ).toBe(true);
    expect(
      SpecTaskListInputSchema.safeParse({
        tasks: [
          {
            id: 'task-reproduce',
            title: 'Reproduce the issue',
            status: 'pending',
            reason: 'Required by the selected strategy.',
            category: 'reproduction',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      SpecTaskListInputSchema.safeParse({
        tasks: [
          { id: 'task-one', title: 'One', status: 'pending', reason: 'Needed.' },
          { id: 'task-one', title: 'Two', status: 'pending', reason: 'Needed.' },
        ],
      }).success,
    ).toBe(false);
    expect(
      SpecTaskListInputSchema.safeParse({
        tasks: [{ id: 'invalid_id', title: 'One', status: 'pending', reason: 'Needed.' }],
      }).success,
    ).toBe(false);
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: { tasks: { type: 'array' } },
    });
  });

  it('renders task rationale, risk, file associations, and evidence', async () => {
    const { tool } = makeTool([
      {
        id: 'task-validate-input',
        title: 'Validate input',
        status: 'in_progress',
        reason: 'Protect the public API from malformed data.',
        risk: 'medium',
        affectedPaths: ['src/validate.ts'],
        changedPaths: ['src/validate.ts', 'test/validate.test.ts'],
        evidence: ['pnpm test validate'],
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('task-validate-input');
    expect(result.output).toContain('Why: Protect the public API');
    expect(result.output).toContain('Risk: medium');
    expect(result.output).toContain('Planned files: src/validate.ts');
    expect(result.output).toContain('Changed files: src/validate.ts, test/validate.test.ts');
    expect(result.output).toContain('Evidence: pnpm test validate');
  });

  it('copies structured task fields before persisting them', async () => {
    const { tool, getTasks } = makeTool();
    const affectedPaths = ['docs/reference.md'];
    const evidence = ['docs build'];
    const tasks: SpecTask[] = [
      {
        id: 'task-document',
        title: 'Document behavior',
        status: 'pending',
        reason: 'Keep the new workflow discoverable.',
        affectedPaths,
        evidence,
      },
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { tasks },
      signal,
    });
    affectedPaths[0] = 'leaked.md';
    evidence[0] = 'leaked evidence';

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Spec task list updated.');
    expect(getTasks()).toEqual([
      {
        id: 'task-document',
        title: 'Document behavior',
        status: 'pending',
        reason: 'Keep the new workflow discoverable.',
        risk: undefined,
        affectedPaths: ['docs/reference.md'],
        changedPaths: undefined,
        evidence: ['docs build'],
      },
    ]);
  });

  it('sets and renders the active task for automatic tracing', async () => {
    const { tool } = makeTool();
    const tasks: SpecTask[] = [
      {
        id: 'task-track-changes',
        title: 'Track changes',
        status: 'in_progress',
        reason: 'Keep the delivery record auditable.',
      },
    ];

    const update = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_update',
      args: { tasks, activeTaskId: 'task-track-changes' },
      signal,
    });
    const query = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_query',
      args: {},
      signal,
    });

    expect(update).toMatchObject({ isError: false });
    expect(query.output).toContain('Active spec task: task-track-changes');
  });

  it('rejects a completed task as the active task without replacing the ledger', async () => {
    const existingTask: SpecTask = {
      id: 'task-existing',
      title: 'Keep existing ledger',
      status: 'in_progress',
      reason: 'Prove rejected updates are atomic.',
    };
    const { tool, getTasks } = makeTool([existingTask]);
    const completedTask: SpecTask = {
      id: 'task-complete',
      title: 'Complete delivery',
      status: 'done',
      reason: 'Keep later tool calls out of completed work.',
    };

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-completed-active-task',
      args: { tasks: [completedTask], activeTaskId: 'task-complete' },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Spec task is not active: task-complete');
    expect(getTasks()).toEqual([existingTask]);
  });

  it('rejects a completed stored task as the active task', async () => {
    const { tool } = makeTool([
      {
        id: 'task-complete',
        title: 'Complete delivery',
        status: 'done',
        reason: 'Keep later tool calls out of completed work.',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-completed-active-task',
      args: { activeTaskId: 'task-complete' },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Spec task is not active: task-complete');
  });

  it('rejects task updates when the spec run has been finalized', async () => {
    const task: SpecTask = {
      id: 'task-finalized',
      title: 'Keep finalized ledger immutable',
      status: 'done',
      reason: 'Preserve the completed delivery evidence.',
    };
    const { tool, getTasks } = makeTool([task], '2026-07-13T01:02:03.000Z');

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-finalized-update',
      args: { activeTaskId: null },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Spec task ledger was finalized at');
    expect(getTasks()).toEqual([task]);
  });

  it('returns the finalized task ledger in query mode', async () => {
    const { tool } = makeTool(
      [
        {
          id: 'task-finalized',
          title: 'Preserve final delivery',
          status: 'done',
          reason: 'Keep the completed evidence available for review.',
        },
      ],
      '2026-07-13T01:02:03.000Z',
    );

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-finalized-query',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('task-finalized');
  });

  it('renders tracked command and file-change details', async () => {
    const { tool, setTraces } = makeTool();
    const task: SpecTask = {
      id: 'task-trace',
      title: 'Trace changes',
      status: 'in_progress',
      reason: 'Keep the audit record useful.',
    };
    const update = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_update',
      args: { tasks: [task], activeTaskId: 'task-trace' },
      signal,
    });
    expect(update).toMatchObject({ isError: false });

    setTraces([
      {
        taskId: 'task-trace',
        toolCallId: 'call_write',
        toolName: 'Write',
        outcome: 'succeeded',
        changedPaths: ['src/example.ts'],
        command: 'pnpm test',
      },
    ]);
    const query = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_query',
      args: {},
      signal,
    });

    expect(query.output).toContain('Changed files: src/example.ts');
    expect(query.output).toContain('Command: pnpm test');
  });
});
