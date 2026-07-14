/**
 * EnterPlanModeTool — plan-mode entry tool.
 *
 * The LLM calls this tool to enter plan mode directly. Entering plan mode
 * does not require approval in any permission mode.
 */


import type { Agent } from '#/agent';
import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './enter-plan-mode.md?raw';

// ── Input schema ─────────────────────────────────────────────────────

export const EnterPlanModeInputSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .optional()
      .describe(
        'Semantic kebab-case name for the spec run directory (e.g. "nebula-effect"), used as specs/<name>/. Omit to get a random name. If the directory already exists, a numeric suffix is appended.',
      ),
  })
  .strict();
export type EnterPlanModeInput = z.infer<typeof EnterPlanModeInputSchema>;

export class EnterPlanModeTool implements BuiltinTool<EnterPlanModeInput> {
  readonly name = 'EnterPlanMode' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(EnterPlanModeInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: EnterPlanModeInput): ToolExecution {
    return {
      description: 'Requesting to enter plan mode',
      approvalRule: this.name,
      execute: async () => {
        // Guard: already in plan mode
        if (this.agent.planMode.isActive) {
          return {
            isError: true,
            output: 'Plan mode is already active. Use ExitPlanMode when the plan is ready.',
          };
        }

        try {
          const id = await this.agent.planMode.resolveSpecRunId(args.name);
          await this.agent.planMode.enter(id);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to enter plan mode.';
          return { isError: true, output: `Failed to enter plan mode: ${message}` };
        }

        this.agent.telemetry.track('plan_enter_resolved', { outcome: 'auto_approved' });
        return {
          output: enteredPlanModeMessage(
            this.agent.planMode.planFilePath,
            this.agent.planMode.specDocuments?.spec,
            this.agent.planMode.specDocuments?.delivery,
          ),
        };
      },
    };
  }
}

function enteredPlanModeMessage(
  planPath: string | null,
  specPath: string | undefined,
  deliveryPath: string | undefined,
): string {
  if (planPath === null) {
    return [
      'Plan mode is now active. Your workflow:',
      '',
      '1. Use read-only tools (Read, Grep, Glob) to investigate the codebase. Use Bash only when needed.',
      '2. Design a concrete, step-by-step plan.',
      '3. Wait for the host to provide a plan file path before calling ExitPlanMode.',
      '',
      'Do NOT use Write or Edit while plan mode is active in this host; no plan file path is available.',
      'Use Bash only when needed; Bash follows the normal permission mode and rules.',
    ].join('\n');
  }

  return [
    'Plan mode is now active. Your workflow:',
    '',
    ...(specPath === undefined ? [`Plan file: ${planPath}`] : [`Specification file: ${specPath}`]),
    ...(deliveryPath === undefined ? [] : [`Delivery record: ${deliveryPath}`]),
    '',
    '1. Use read-only tools (Read, Grep, Glob) to investigate the codebase. Use Bash only when needed.',
    '2. Design a concrete, step-by-step plan.',
    specPath === undefined
      ? '3. Write the plan to the plan file with Write or Edit.'
      : '3. Fill in the specification: set the frontmatter (type, priority, mode), then complete the 目标 and 验收标准 sections and the task checklist. Question the user only when a requirement is ambiguous AND high-risk; otherwise pick a sensible default and note it in 关键决策.',
    '4. When the plan is ready, call ExitPlanMode for user approval.',
    '',
    specPath === undefined
      ? 'Do NOT edit files other than the plan file while plan mode is active.'
      : 'Do NOT edit files other than the specification file while plan mode is active. The delivery record is filled in after implementation.',
    'Use Bash only when needed; Bash follows the normal permission mode and rules.',
  ].join('\n');
}
