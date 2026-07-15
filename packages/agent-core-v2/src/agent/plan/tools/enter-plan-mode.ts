/**
 * EnterPlanModeTool — plan-mode entry tool.
 *
 * The LLM calls this tool to enter plan mode directly. Entering plan mode
 * does not require approval in any permission mode.
 */

import { z } from 'zod';

import type { BuiltinTool, ToolExecution } from '#/tool/toolContract';
import { registerTool } from '#/agent/toolRegistry/toolContribution';
import { toInputJsonSchema } from '#/tool/input-schema';
import { ITelemetryService } from '#/app/telemetry/telemetry';
import { IAgentPlanService, type PlanData } from '#/agent/plan/plan';
import DESCRIPTION from './enter-plan-mode.md?raw';


export const EnterPlanModeInputSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .optional()
      .describe(
        'Semantic kebab-case name for the spec run directory (e.g. "nebula-effect"). Omit to get a random name. If the directory already exists, a numeric suffix is appended.',
      ),
  })
  .strict();
export type EnterPlanModeInput = z.infer<typeof EnterPlanModeInputSchema>;

export class EnterPlanModeTool implements BuiltinTool<EnterPlanModeInput> {
  readonly name = 'EnterPlanMode' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(EnterPlanModeInputSchema);

  constructor(
    @IAgentPlanService private readonly planMode: IAgentPlanService,
    @ITelemetryService private readonly telemetry: ITelemetryService,
  ) {}

  resolveExecution(args: EnterPlanModeInput): ToolExecution {
    return {
      description: 'Requesting to enter plan mode',
      approvalRule: this.name,
      execute: async () => {
        const before = await this.planMode.status();
        if (before !== null) {
          return {
            isError: true,
            output: 'Plan mode is already active. Use ExitPlanMode when the plan is ready.',
          };
        }

        try {
          await this.planMode.enter(args.name);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to enter plan mode.';
          return { isError: true, output: `Failed to enter plan mode: ${message}` };
        }

        this.telemetry.track2('plan_enter_resolved', { outcome: 'auto_approved' });
        const after = await this.planMode.status();
        return { output: enteredPlanModeMessage(after) };
      },
    };
  }
}

registerTool(EnterPlanModeTool);

function enteredPlanModeMessage(plan: PlanData): string {
  if (plan === null) {
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
    ...(plan.deliveryPath === undefined
      ? [`Plan file: ${plan.path}`]
      : [`Specification file: ${plan.path}`, `Delivery record: ${plan.deliveryPath}`]),
    '',
    '1. Use read-only tools (Read, Grep, Glob) to investigate the codebase. Use Bash only when needed.',
    '2. Design a concrete, step-by-step plan.',
    plan.deliveryPath === undefined
      ? '3. Write the plan to the plan file with Write or Edit.'
      : '3. Use adaptive intent clarification for ambiguous, high-risk requirements; then complete the specification frontmatter, 用户原始描述, 目标, 验收标准, and task checklist. Record sensible defaults in 关键决策.',
    '4. When the plan is ready, call ExitPlanMode for user approval.',
    '',
    plan.deliveryPath === undefined
      ? 'Do NOT edit files other than the plan file while plan mode is active.'
      : 'Do NOT edit files other than the specification file while plan mode is active. Complete the delivery record after implementation.',
    'Use Bash only when needed; Bash follows the normal permission mode and rules.',
  ].join('\n');
}
