import { describe, expect, it } from 'vitest';

import {
  SPEC_TASK_LIST_TOOL_NAME,
  SPEC_TASK_STORE_KEY,
  SpecTaskListInputSchema,
  SpecTaskListTool,
  type SpecTask,
} from '../../src/tools/builtin/state/spec-task-list';
import type { ToolStore } from '../../src/tools/store';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;

function makeTool(initial: readonly SpecTask[] = []): {
  tool: SpecTaskListTool;
  getTasks(): readonly SpecTask[];
} {
  let tasks = [...initial];
  const store: ToolStore = {
    get: (key) => (key === SPEC_TASK_STORE_KEY ? tasks : undefined),
    set: (key, value) => {
      if (key === SPEC_TASK_STORE_KEY) {
        tasks = [...(value as readonly SpecTask[])];
      }
    },
  };
  return { tool: new SpecTaskListTool(store), getTasks: () => tasks };
}

describe('SpecTaskListTool', () => {
  it('exposes a structured replacement schema', () => {
    const { tool } = makeTool();

    expect(SPEC_TASK_LIST_TOOL_NAME).toBe('SpecTaskList');
    expect(SPEC_TASK_STORE_KEY).toBe('specTasks');
    expect(SpecTaskListInputSchema.safeParse({}).success).toBe(true);
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
});
