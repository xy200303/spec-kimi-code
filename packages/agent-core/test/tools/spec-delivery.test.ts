import { describe, expect, it, vi } from 'vitest';

import { FlagResolver } from '../../src/flags';
import {
  SPEC_DELIVERY_STORE_KEY,
  SpecDeliveryTool,
  type SpecDeliveryContext,
} from '../../src/tools/builtin/state/spec-delivery';
import {
  SPEC_TASK_STORE_KEY,
  SPEC_TASK_TRACE_STORE_KEY,
  type SpecTask,
} from '../../src/tools/builtin/state/spec-task-list';
import type { ToolStore } from '../../src/tools/store';
import { createFakeKaos } from './fixtures/fake-kaos';
import { executeTool } from './fixtures/execute-tool';
import { testAgent } from '../agent/harness/agent';

// Scenarios: delivery drafts and completions.
// Wiring: real agent state and an in-memory Kaos filesystem.
// Run: vitest spec-delivery.test.ts.
const signal = new AbortController().signal;

async function createRig() {
  const files = new Map<string, string>();
  const writeText = vi.fn(async (path: string, content: string) => {
    files.set(path, content);
    return content.length;
  });
  const ctx = testAgent({
    experimentalFlags: new FlagResolver({ KIMI_CODE_EXPERIMENTAL_SPEC_CODING: '1' }),
    kaos: createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn(async (path: string) => {
        const content = files.get(path);
        if (content !== undefined) return content;
        const error = new Error(`Missing file: ${path}`) as Error & { code: string };
        error.code = 'ENOENT';
        throw error;
      }),
      writeText,
    }),
  });
  ctx.configure();
  await ctx.agent.planMode.enter('delivery-record');

  const context = ctx.agent.tools.storeData()[SPEC_DELIVERY_STORE_KEY] as SpecDeliveryContext;
  files.set(
    context.spec,
    '# Specification\n\n## Goal\n\nCreate a traceable delivery record.\n\n## Constraints\n\nKeep it project-local.\n\n## Acceptance Criteria\n\n- Include evidence.',
  );
  files.set(
    context.design,
    '# Design\n\n## Tasks\n\n- Generate a delivery record.\n\n## Risks\n\n- Evidence may be incomplete.\n\n## Verification\n\n- Run focused tests.',
  );
  const store: ToolStore = {
    get: (key) => ctx.agent.tools.storeData()[key] as never,
    set: (key, value) => ctx.agent.tools.updateStore(key, value),
  };
  return { context, files, store, tool: new SpecDeliveryTool(ctx.agent, store) };
}

describe('SpecDeliveryTool', () => {
  it('writes a structured draft when the run has tracked work', async () => {
    const { context, files, store, tool } = await createRig();
    const tasks: readonly SpecTask[] = [
      {
        id: 'task-delivery',
        title: 'Create delivery record',
        status: 'done',
        reason: 'Provide an auditable handoff.',
        changedPaths: ['src/delivery.ts'],
      },
    ];
    store.set(SPEC_TASK_STORE_KEY, tasks);
    store.set(SPEC_TASK_TRACE_STORE_KEY, [
      {
        taskId: 'task-delivery',
        toolCallId: 'call-test',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm test delivery',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-delivery',
      args: {
        evidence: [{ kind: 'tests', detail: 'pnpm test delivery' }],
        decisions: ['Use a generated Markdown record.'],
        rollbackNotes: ['Delete the delivery record and revert the feature.'],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain(context.delivery);
    expect(files.get(context.delivery)).toContain('## Status\n\nDraft');
    expect(files.get(context.delivery)).toContain('Create a traceable delivery record.');
    expect(files.get(context.delivery)).toContain('[done] task-delivery');
    expect(files.get(context.delivery)).toContain('src/delivery.ts');
    expect(files.get(context.delivery)).toContain('[succeeded] pnpm test delivery');
  });

  it('rejects completion when tasks or quality evidence are incomplete', async () => {
    const { context, files, store, tool } = await createRig();
    const initial = files.get(context.delivery);
    store.set(SPEC_TASK_STORE_KEY, [
      {
        id: 'task-verify',
        title: 'Verify delivery',
        status: 'in_progress',
        reason: 'Ensure the output is ready.',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-complete',
      args: { complete: true, evidence: [{ kind: 'tests', detail: 'pnpm test' }] },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Incomplete spec tasks: task-verify');
    expect(result.output).toContain('Typecheck or build');
    expect(files.get(context.delivery)).toBe(initial);
  });

  it('marks the record complete when the standard quality gate passes', async () => {
    const { context, files, store, tool } = await createRig();
    store.set(SPEC_TASK_STORE_KEY, [
      {
        id: 'task-complete',
        title: 'Complete delivery',
        status: 'done',
        reason: 'Close the approved work.',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-complete',
      args: {
        complete: true,
        evidence: [
          { kind: 'tests', detail: 'pnpm test' },
          { kind: 'typecheck_or_build', detail: 'pnpm typecheck' },
          { kind: 'lint_or_format', detail: 'pnpm lint' },
          { kind: 'diff_review', detail: 'Reviewed the final diff.' },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Completed delivery record');
    expect(files.get(context.delivery)).toContain('## Status\n\nComplete');
    expect(files.get(context.delivery)).toContain('[x] Diff review: Reviewed the final diff.');
  });
});
