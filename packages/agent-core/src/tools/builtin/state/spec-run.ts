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
import DESCRIPTION from './spec-run.md?raw';

export const SPEC_RUN_TOOL_NAME = 'SpecRun' as const;

export const SpecRunInputSchema = z.object({}).strict();
export type SpecRunInput = z.infer<typeof SpecRunInputSchema>;

export class SpecRunTool implements BuiltinTool<SpecRunInput> {
  readonly name = SPEC_RUN_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SpecRunInputSchema);

  constructor(private readonly store: ToolStore) {}

  resolveExecution(): ToolExecution {
    return {
      description: 'Reading approved spec run',
      approvalRule: this.name,
      execute: async () => {
        const context = this.store.get(SPEC_DELIVERY_STORE_KEY);
        if (!isSpecDeliveryContext(context) || context.approved === undefined) {
          return {
            isError: true,
            output: 'No approved spec run is available. Complete and approve spec plan mode first.',
          };
        }
        return { output: renderSpecRun(context) };
      },
    };
  }
}

function renderSpecRun(context: SpecDeliveryContext): string {
  const approved = context.approved;
  if (approved === undefined) return 'No approved spec run is available.';
  const { specification, design } = approved;
  return `Approved spec run
Quality gate: ${context.qualityGate}
Strategy: ${context.strategy?.strategy ?? 'Not routed'}

Goal:
${markdownSection(specification, 'Goal') || 'Not recorded.'}

Constraints:
${markdownSection(specification, 'Constraints') || 'Not recorded.'}

Acceptance criteria:
${markdownSection(specification, 'Acceptance Criteria') || 'Not recorded.'}

Plan:
${markdownSection(design, 'Tasks') || 'Not recorded.'}

Verification:
${markdownSection(design, 'Verification') || 'Not recorded.'}`;
}
