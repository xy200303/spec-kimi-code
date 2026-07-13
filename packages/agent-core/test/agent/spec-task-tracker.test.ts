import { describe, expect, it } from 'vitest';

import { FlagResolver } from '../../src/flags';
import {
  SPEC_TASK_ACTIVE_STORE_KEY,
  SPEC_TASK_STORE_KEY,
  SPEC_TASK_TRACE_STORE_KEY,
  type SpecTask,
} from '../../src/tools/builtin/state/spec-task-list';
import { testAgent } from './harness/agent';

// Scenarios: tool outcomes are bound to the active task. Wiring: a real test agent and tool store.
describe('SpecTaskTracker', () => {
  it('records a successful file change against the active task', () => {
    const ctx = testAgent({
      experimentalFlags: new FlagResolver({ KIMI_CODE_EXPERIMENTAL_SPEC_CODING: '1' }),
    });
    const tasks: readonly SpecTask[] = [
      {
        id: 'task-write-spec',
        title: 'Write specification',
        status: 'in_progress',
        reason: 'Capture the approved requirements.',
      },
    ];
    ctx.agent.tools.updateStore(SPEC_TASK_STORE_KEY, tasks);
    ctx.agent.tools.updateStore(SPEC_TASK_ACTIVE_STORE_KEY, 'task-write-spec');

    ctx.agent.specTaskTracker.recordToolResult({
      toolCallId: 'call_write_spec',
      toolName: 'Write',
      args: { path: '/workspace/specs/run/spec.md', content: '# Specification' },
      result: { output: 'written' },
    });

    expect(ctx.agent.tools.storeData()[SPEC_TASK_STORE_KEY]).toEqual([
      {
        ...tasks[0]!,
        changedPaths: ['/workspace/specs/run/spec.md'],
      },
    ]);
    expect(ctx.agent.tools.storeData()[SPEC_TASK_TRACE_STORE_KEY]).toEqual([
      {
        taskId: 'task-write-spec',
        toolCallId: 'call_write_spec',
        toolName: 'Write',
        outcome: 'succeeded',
        changedPaths: ['/workspace/specs/run/spec.md'],
        command: undefined,
        delegation: undefined,
      },
    ]);
  });

  it('retains failed command attempts without adding changed files', () => {
    const ctx = testAgent({
      experimentalFlags: new FlagResolver({ KIMI_CODE_EXPERIMENTAL_SPEC_CODING: '1' }),
    });
    const tasks: readonly SpecTask[] = [
      {
        id: 'task-verify',
        title: 'Verify the feature',
        status: 'in_progress',
        reason: 'Collect evidence before delivery.',
      },
    ];
    ctx.agent.tools.updateStore(SPEC_TASK_STORE_KEY, tasks);
    ctx.agent.tools.updateStore(SPEC_TASK_ACTIVE_STORE_KEY, 'task-verify');

    ctx.agent.specTaskTracker.recordToolResult({
      toolCallId: 'call_test',
      toolName: 'Bash',
      args: { command: 'pnpm test' },
      result: { output: 'failed', isError: true },
    });

    expect(ctx.agent.tools.storeData()[SPEC_TASK_STORE_KEY]).toEqual(tasks);
    expect(ctx.agent.tools.storeData()[SPEC_TASK_TRACE_STORE_KEY]).toEqual([
      {
        taskId: 'task-verify',
        toolCallId: 'call_test',
        toolName: 'Bash',
        outcome: 'failed',
        changedPaths: undefined,
        command: 'pnpm test',
        delegation: undefined,
      },
    ]);
  });
});
