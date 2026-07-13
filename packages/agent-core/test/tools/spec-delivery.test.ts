import { describe, expect, it, vi } from 'vitest';

import { FlagResolver } from '../../src/flags';
import {
  SPEC_DELIVERY_STORE_KEY,
  SpecDeliveryInputSchema,
  SpecDeliveryTool,
  type SpecDeliveryContext,
} from '../../src/tools/builtin/state/spec-delivery';
import { SpecRunTool } from '../../src/tools/builtin/state/spec-run';
import {
  SPEC_TASK_ACTIVE_STORE_KEY,
  SPEC_TASK_STORE_KEY,
  SPEC_TASK_TRACE_STORE_KEY,
  type SpecTask,
} from '../../src/tools/builtin/state/spec-task-list';
import type { ToolStore } from '../../src/tools/store';
import { createFakeKaos } from './fixtures/fake-kaos';
import { executeTool } from './fixtures/execute-tool';
import { testAgent } from '../agent/harness/agent';

// Scenarios: approved-run snapshots, approval evidence, delivery drafts, and completions.
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
  const approvedContext: SpecDeliveryContext = {
    ...context,
    approved: {
      specification: files.get(context.spec)!,
      design: files.get(context.design)!,
      approval: {
        source: 'auto',
        approvedAt: '2026-07-13T00:00:00.000Z',
      },
    },
  };
  ctx.agent.tools.updateStore(SPEC_DELIVERY_STORE_KEY, approvedContext);
  const store: ToolStore = {
    get: (key) => ctx.agent.tools.storeData()[key] as never,
    set: (key, value) => ctx.agent.tools.updateStore(key, value),
  };
  return {
    context: approvedContext,
    files,
    store,
    tool: new SpecDeliveryTool(ctx.agent, store),
    specRun: new SpecRunTool(ctx.agent, store),
  };
}

describe('SpecDeliveryTool', () => {
  it('rejects evidence without a tool call identifier during input validation', () => {
    expect(
      SpecDeliveryInputSchema.safeParse({
        evidence: [{ kind: 'tests', detail: 'pnpm test' }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate evidence types during input validation', () => {
    expect(
      SpecDeliveryInputSchema.safeParse({
        evidence: [
          { kind: 'tests', detail: 'pnpm test', toolCallId: 'call-test' },
          { kind: 'tests', detail: 'pnpm test again', toolCallId: 'call-test-again' },
        ],
      }).success,
    ).toBe(false);
  });

  it('returns the approved goal when source documents change', async () => {
    const { context, files, specRun } = await createRig();
    files.set(context.spec, '# Specification\n\n## Goal\n\nChanged after approval.');

    const result = await executeTool(specRun, {
      turnId: 't1',
      toolCallId: 'call-spec-run',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Create a traceable delivery record.');
    expect(result.output).not.toContain('Changed after approval.');
    expect(result.output).toContain(`Spec document drift: detected in ${context.spec}.`);
  });

  it('rejects the run query when approval has not been finalized', async () => {
    const { context, store, specRun } = await createRig();
    const snapshot = context.approved;
    if (snapshot === undefined) throw new Error('expected an approved snapshot');
    store.set(SPEC_DELIVERY_STORE_KEY, {
      ...context,
      approved: {
        ...snapshot,
        approval: undefined,
      },
    });

    const result = await executeTool(specRun, {
      turnId: 't1',
      toolCallId: 'call-pending-spec-run',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('No approved spec run is available');
  });

  it('rejects a delivery update when approval has not been finalized', async () => {
    const { context, store, tool } = await createRig();
    const snapshot = context.approved;
    if (snapshot === undefined) throw new Error('expected an approved snapshot');
    store.set(SPEC_DELIVERY_STORE_KEY, {
      ...context,
      approved: {
        ...snapshot,
        approval: undefined,
      },
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-pending-delivery',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('No approved spec run is available');
  });

  it('reports the delivery finalization time through the approved run', async () => {
    const { context, store, specRun } = await createRig();
    store.set(SPEC_DELIVERY_STORE_KEY, {
      ...context,
      finalizedAt: '2026-07-13T01:02:03.000Z',
    });

    const result = await executeTool(specRun, {
      turnId: 't1',
      toolCallId: 'call-finalized-spec-run',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Delivery finalization: 2026-07-13T01:02:03.000Z');
  });

  it('writes a structured draft when the run has tracked work', async () => {
    const { context, files, store, tool } = await createRig();
    const tasks: readonly SpecTask[] = [
      {
        id: 'task-delivery',
        title: 'Create delivery record',
        status: 'done',
        reason: 'Provide an auditable handoff.',
        risk: 'medium',
        changedPaths: ['src/delivery.ts'],
      },
    ];
    store.set(SPEC_TASK_STORE_KEY, tasks);
    store.set(SPEC_DELIVERY_STORE_KEY, {
      ...context,
      strategy: {
        strategy: 'bug_diagnosis',
        recommendedQualityGate: 'strict',
        requiredTaskCategories: ['reproduction', 'root_cause', 'regression_test'],
        reasons: ['Matched "regression" in the approved specification or design.'],
      },
    });
    files.set(context.spec, '# Specification\n\n## Goal\n\nChanged after approval.');
    store.set(SPEC_TASK_TRACE_STORE_KEY, [
      {
        taskId: 'task-delivery',
        toolCallId: 'call-test',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm test delivery',
      },
      {
        taskId: 'task-delivery',
        toolCallId: 'call-review',
        toolName: 'Agent',
        outcome: 'succeeded',
        delegation: 'Review the delivery evidence.',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-delivery',
      args: {
        evidence: [
          { kind: 'tests', detail: 'pnpm test delivery', toolCallId: 'call-test' },
        ],
        decisions: ['Use a generated Markdown record.'],
        rollbackNotes: ['Delete the delivery record and revert the feature.'],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain(context.delivery);
    expect(files.get(context.delivery)).toContain('## Status\n\nDraft');
    expect(files.get(context.delivery)).toContain('Create a traceable delivery record.');
    expect(files.get(context.delivery)).toContain('## Acceptance Criteria\n\n- Include evidence.');
    expect(files.get(context.delivery)).toContain('## Approval\n\nSource: auto');
    expect(files.get(context.delivery)).toContain('[done] task-delivery');
    expect(files.get(context.delivery)).toContain('Selected: bug_diagnosis');
    expect(files.get(context.delivery)).toContain('Recommended quality gate: strict');
    expect(files.get(context.delivery)).toContain('src/delivery.ts');
    expect(files.get(context.delivery)).toContain('Task: task-delivery — Create delivery record');
    expect(files.get(context.delivery)).toContain('Reason: Provide an auditable handoff.');
    expect(files.get(context.delivery)).toContain('Risk: medium');
    expect(files.get(context.delivery)).toContain('Tool calls: Bash (call-test)');
    expect(files.get(context.delivery)).toContain('## Activity\n\n- [succeeded] Bash (call-test)');
    expect(files.get(context.delivery)).toContain('Command: pnpm test delivery');
    expect(files.get(context.delivery)).toContain('Delegation: Review the delivery evidence.');
    expect(files.get(context.delivery)).toContain('[succeeded] pnpm test delivery');
    expect(JSON.parse(files.get(context.deliveryJson) ?? '{}')).toMatchObject({
      schemaVersion: 1,
      status: 'draft',
      documents: {
        deliveryMarkdown: context.delivery,
        deliveryJson: context.deliveryJson,
      },
      goal: 'Create a traceable delivery record.',
      changes: [
        {
          path: 'src/delivery.ts',
          taskId: 'task-delivery',
          reason: 'Provide an auditable handoff.',
          risk: 'medium',
          toolCallIds: ['call-test'],
        },
      ],
      activity: [
        {
          toolCallId: 'call-review',
          toolName: 'Agent',
          delegation: 'Review the delivery evidence.',
        },
      ],
    });
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
      args: {
        complete: true,
        evidence: [{ kind: 'tests', detail: 'pnpm test', toolCallId: 'call-test' }],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Incomplete spec tasks: task-verify');
    expect(result.output).toContain('Typecheck or build');
    expect(result.output).toContain('Unverified evidence references: tool call call-test');
    expect(files.get(context.delivery)).toBe(initial);
  });

  it('rejects completion when required strategy task categories are missing', async () => {
    const { context, store, tool } = await createRig();
    store.set(SPEC_DELIVERY_STORE_KEY, {
      ...context,
      strategy: {
        strategy: 'bug_diagnosis',
        recommendedQualityGate: 'strict',
        requiredTaskCategories: ['reproduction', 'root_cause', 'regression_test'],
        reasons: ['Matched "regression" in the approved specification or design.'],
      },
    });
    store.set(SPEC_TASK_STORE_KEY, [
      {
        id: 'task-reproduce',
        title: 'Reproduce the issue',
        status: 'done',
        reason: 'Establish the failure before fixing it.',
        category: 'reproduction',
      },
    ]);
    store.set(SPEC_TASK_TRACE_STORE_KEY, [
      {
        taskId: 'task-reproduce',
        toolCallId: 'call-tests',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm test',
      },
      {
        taskId: 'task-reproduce',
        toolCallId: 'call-typecheck',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm typecheck',
      },
      {
        taskId: 'task-reproduce',
        toolCallId: 'call-lint',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm lint',
      },
      {
        taskId: 'task-reproduce',
        toolCallId: 'call-diff',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'git diff --check',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-strategy-complete',
      args: {
        complete: true,
        evidence: [
          { kind: 'tests', detail: 'pnpm test', toolCallId: 'call-tests' },
          { kind: 'typecheck_or_build', detail: 'pnpm typecheck', toolCallId: 'call-typecheck' },
          { kind: 'lint_or_format', detail: 'pnpm lint', toolCallId: 'call-lint' },
          { kind: 'diff_review', detail: 'git diff --check', toolCallId: 'call-diff' },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Missing strategy task categories: root_cause, regression_test');
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
    store.set(SPEC_TASK_TRACE_STORE_KEY, [
      {
        taskId: 'task-complete',
        toolCallId: 'call-tests',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm test',
      },
      {
        taskId: 'task-complete',
        toolCallId: 'call-typecheck',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm typecheck',
      },
      {
        taskId: 'task-complete',
        toolCallId: 'call-lint',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm lint',
      },
      {
        taskId: 'task-complete',
        toolCallId: 'call-diff',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'git diff --check',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-complete',
      args: {
        complete: true,
        evidence: [
          { kind: 'tests', detail: 'pnpm test', toolCallId: 'call-tests' },
          {
            kind: 'typecheck_or_build',
            detail: 'pnpm typecheck',
            toolCallId: 'call-typecheck',
          },
          { kind: 'lint_or_format', detail: 'pnpm lint', toolCallId: 'call-lint' },
          {
            kind: 'diff_review',
            detail: 'Reviewed the final diff.',
            toolCallId: 'call-diff',
          },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Completed delivery records');
    expect(files.get(context.delivery)).toContain('## Status\n\nComplete');
    expect(files.get(context.delivery)).toContain('Finalized at:');
    expect(JSON.parse(files.get(context.deliveryJson) ?? '{}')).toMatchObject({
      status: 'complete',
      finalizedAt: expect.any(String),
    });
    expect(files.get(context.delivery)).toContain('[x] Diff review: Reviewed the final diff.');
    expect(files.get(context.delivery)).toContain('tool call call-diff; git diff --check');
  });

  it('rejects updates after finalizing a delivery record', async () => {
    const { context, files, store, tool } = await createRig();
    store.set(SPEC_TASK_STORE_KEY, [
      {
        id: 'task-complete',
        title: 'Complete delivery',
        status: 'done',
        reason: 'Close the approved work.',
      },
    ]);
    store.set(SPEC_TASK_ACTIVE_STORE_KEY, 'task-complete');
    store.set(SPEC_TASK_TRACE_STORE_KEY, [
      {
        taskId: 'task-complete',
        toolCallId: 'call-tests',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm test',
      },
      {
        taskId: 'task-complete',
        toolCallId: 'call-typecheck',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm typecheck',
      },
      {
        taskId: 'task-complete',
        toolCallId: 'call-lint',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm lint',
      },
      {
        taskId: 'task-complete',
        toolCallId: 'call-diff',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'git diff --check',
      },
    ]);
    const completionArgs = {
      complete: true,
      evidence: [
        { kind: 'tests' as const, detail: 'pnpm test', toolCallId: 'call-tests' },
        {
          kind: 'typecheck_or_build' as const,
          detail: 'pnpm typecheck',
          toolCallId: 'call-typecheck',
        },
        { kind: 'lint_or_format' as const, detail: 'pnpm lint', toolCallId: 'call-lint' },
        { kind: 'diff_review' as const, detail: 'Final diff check', toolCallId: 'call-diff' },
      ],
    };
    const completed = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-complete',
      args: completionArgs,
      signal,
    });
    const delivery = files.get(context.delivery);
    const manifest = files.get(context.deliveryJson);

    const update = await executeTool(tool, {
      turnId: 't2',
      toolCallId: 'call-update',
      args: { decisions: ['Attempt to change the finalized handoff.'] },
      signal,
    });

    expect(completed).toMatchObject({ isError: false });
    expect(update).toMatchObject({ isError: true });
    expect(update.output).toContain('Delivery records were finalized at');
    expect(files.get(context.delivery)).toBe(delivery);
    expect(files.get(context.deliveryJson)).toBe(manifest);
    expect(store.get(SPEC_TASK_ACTIVE_STORE_KEY)).toBeNull();
  });

  it('rejects completion when quality evidence belongs to no completed task', async () => {
    const { context, files, store, tool } = await createRig();
    const initial = files.get(context.delivery);
    store.set(SPEC_TASK_STORE_KEY, [
      {
        id: 'task-complete',
        title: 'Complete delivery',
        status: 'done',
        reason: 'Close the approved work.',
      },
    ]);
    store.set(SPEC_TASK_TRACE_STORE_KEY, [
      {
        taskId: 'task-missing',
        toolCallId: 'call-tests',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm test',
      },
      {
        taskId: 'task-missing',
        toolCallId: 'call-typecheck',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm typecheck',
      },
      {
        taskId: 'task-missing',
        toolCallId: 'call-lint',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm lint',
      },
      {
        taskId: 'task-missing',
        toolCallId: 'call-diff',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'git diff --check',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-complete',
      args: {
        complete: true,
        evidence: [
          { kind: 'tests', detail: 'pnpm test', toolCallId: 'call-tests' },
          {
            kind: 'typecheck_or_build',
            detail: 'pnpm typecheck',
            toolCallId: 'call-typecheck',
          },
          { kind: 'lint_or_format', detail: 'pnpm lint', toolCallId: 'call-lint' },
          { kind: 'diff_review', detail: 'Final diff check', toolCallId: 'call-diff' },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('must belong to completed spec tasks');
    expect(result.output).toContain('tool call call-tests');
    expect(files.get(context.delivery)).toBe(initial);
  });

  it('rejects completion when evidence references a background Bash call', async () => {
    const { context, files, store, tool } = await createRig();
    const initial = files.get(context.delivery);
    store.set(SPEC_TASK_STORE_KEY, [
      {
        id: 'task-verify',
        title: 'Verify delivery',
        status: 'done',
        reason: 'Ensure the output is ready.',
      },
    ]);
    store.set(SPEC_TASK_TRACE_STORE_KEY, [
      {
        taskId: 'task-verify',
        toolCallId: 'call-tests',
        toolName: 'Bash',
        outcome: 'succeeded',
        background: true,
        command: 'pnpm test',
      },
      {
        taskId: 'task-verify',
        toolCallId: 'call-typecheck',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm typecheck',
      },
      {
        taskId: 'task-verify',
        toolCallId: 'call-lint',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'pnpm lint',
      },
      {
        taskId: 'task-verify',
        toolCallId: 'call-diff',
        toolName: 'Bash',
        outcome: 'succeeded',
        command: 'git diff --check',
      },
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call-complete',
      args: {
        complete: true,
        evidence: [
          { kind: 'tests', detail: 'pnpm test', toolCallId: 'call-tests' },
          {
            kind: 'typecheck_or_build',
            detail: 'pnpm typecheck',
            toolCallId: 'call-typecheck',
          },
          { kind: 'lint_or_format', detail: 'pnpm lint', toolCallId: 'call-lint' },
          { kind: 'diff_review', detail: 'Final diff check', toolCallId: 'call-diff' },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Unverified evidence references: tool call call-tests');
    expect(files.get(context.delivery)).toBe(initial);
  });
});
