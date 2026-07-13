import type { Agent } from '#/agent';
import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import type { ToolStore } from '../../store';
import {
  isSpecDeliveryContext,
  markdownSection,
  SPEC_DELIVERY_STORE_KEY,
  type SpecDeliveryContext,
} from './spec-delivery';
import {
  SPEC_TASK_STORE_KEY,
  type SpecTask,
} from './spec-task-list';
import DESCRIPTION from './spec-run.md?raw';

export const SPEC_RUN_TOOL_NAME = 'SpecRun' as const;

export const SpecRunInputSchema = z.object({}).strict();
export type SpecRunInput = z.infer<typeof SpecRunInputSchema>;

export class SpecRunTool implements BuiltinTool<SpecRunInput> {
  readonly name = SPEC_RUN_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SpecRunInputSchema);

  constructor(
    private readonly agent: Agent,
    private readonly store: ToolStore,
  ) {}

  resolveExecution(): ToolExecution {
    return {
      description: 'Reading approved spec run',
      approvalRule: this.name,
      execute: async () => {
        const context = this.store.get(SPEC_DELIVERY_STORE_KEY);
        if (!isSpecDeliveryContext(context) || context.approved?.approval === undefined) {
          return {
            isError: true,
            output: 'No approved spec run is available. Complete and approve spec plan mode first.',
          };
        }
        return {
          output: renderSpecRun(context, this.tasks(), await this.documentDrift(context)),
        };
      },
    };
  }

  private tasks(): readonly SpecTask[] {
    const value = this.store.get(SPEC_TASK_STORE_KEY);
    return Array.isArray(value) ? value.filter(isSpecTask) : [];
  }

  private async documentDrift(context: SpecDeliveryContext): Promise<string> {
    const approved = context.approved;
    if (approved === undefined) return 'Spec document drift: unavailable.';
    try {
      const [specification, design] = await Promise.all([
        this.agent.kaos.readText(context.spec),
        this.agent.kaos.readText(context.design),
      ]);
      const changed = [
        ...(specification === approved.specification ? [] : [context.spec]),
        ...(design === approved.design ? [] : [context.design]),
      ];
      return changed.length === 0
        ? 'Spec document drift: none.'
        : `Spec document drift: detected in ${changed.join(', ')}. Delivery records continue to use the approved snapshot.`;
    } catch {
      return 'Spec document drift: unable to compare current documents.';
    }
  }
}

function renderSpecRun(
  context: SpecDeliveryContext,
  tasks: readonly SpecTask[],
  drift: string,
): string {
  const approved = context.approved;
  if (approved === undefined) return 'No approved spec run is available.';
  const { specification, design } = approved;
  return `Approved spec run
Quality gate: ${context.qualityGate}
Strategy: ${context.strategy?.strategy ?? 'Not routed'}
Required task categories: ${context.strategy?.requiredTaskCategories.join(', ') ?? 'Not recorded'}
Approval source: ${approved.approval?.source ?? 'Not recorded'}
Approved at: ${approved.approval?.approvedAt ?? 'Not recorded'}
Selected option: ${approved.approval?.selectedOption ?? 'Not selected'}
Delivery finalization: ${context.finalizedAt ?? 'Not finalized'}
${drift}

Goal:
${markdownSection(specification, 'Goal') || 'Not recorded.'}

Constraints:
${markdownSection(specification, 'Constraints') || 'Not recorded.'}

Acceptance criteria:
${markdownSection(specification, 'Acceptance Criteria') || 'Not recorded.'}

Plan:
${markdownSection(design, 'Tasks') || 'Not recorded.'}

Current tasks:
${renderCurrentTasks(tasks)}

Risks:
${markdownSection(design, 'Risks') || 'Not recorded.'}

Verification:
${markdownSection(design, 'Verification') || 'Not recorded.'}`;
}

function renderCurrentTasks(tasks: readonly SpecTask[]): string {
  if (tasks.length === 0) return 'No spec tasks recorded.';
  return tasks.map((task) => `- [${task.status}] ${task.id}: ${task.title}`).join('\n');
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
