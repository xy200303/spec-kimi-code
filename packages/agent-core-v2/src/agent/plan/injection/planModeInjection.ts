/**
 * `plan` domain (L4) — plan-mode context injection.
 *
 * Owns the `plan_mode` context-injection provider: while plan mode is active it
 * emits the full / sparse / re-entry reminders (deduped against recent history),
 * and on the first inject after deactivation it emits the exit reminder. It reads
 * the live plan state through `IAgentPlanService.status()` and the recent history
 * through `IAgentContextMemoryService`, so no derived-state closures are needed.
 * The telemetry `mode` restore on replay is NOT part of this provider — it lives
 * in `AgentPlanService.restoreTelemetryMode`.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import type { ContextMessage } from '#/agent/contextMemory/types';
import { SPEC_CODING_FLAG_ID } from '#/agent/plan/flag';
import { IAgentPlanService } from '#/agent/plan/plan';
import type { PlanFilePath } from '#/agent/plan/plan';
import { IFlagService } from '#/app/flag/flag';
import PLAN_MODE_EXIT_REMINDER from './plan-mode-exit-reminder.md?raw';
import PLAN_MODE_FULL_REMINDER from './plan-mode-full-reminder.md?raw';
import PLAN_MODE_INLINE_FULL_REMINDER from './plan-mode-inline-full-reminder.md?raw';
import PLAN_MODE_INLINE_REENTRY_REMINDER from './plan-mode-inline-reentry-reminder.md?raw';
import PLAN_MODE_INLINE_SPARSE_REMINDER from './plan-mode-inline-sparse-reminder.md?raw';
import PLAN_MODE_REENTRY_REMINDER from './plan-mode-reentry-reminder.md?raw';
import PLAN_MODE_SPARSE_REMINDER from './plan-mode-sparse-reminder.md?raw';

const PLAN_MODE_DEDUP_MIN_TURNS = 2;
const PLAN_MODE_FULL_REFRESH_TURNS = 5;
const PLAN_MODE_INJECTION_VARIANT = 'plan_mode';

export class PlanModeInjection extends Disposable {
  constructor(
    @IAgentContextInjectorService dynamicInjector: IAgentContextInjectorService,
    @IAgentPlanService private readonly plan: IAgentPlanService,
    @IAgentContextMemoryService private readonly context: IAgentContextMemoryService,
    @IFlagService private readonly flags: IFlagService,
  ) {
    super();

    let wasActive = false;
    this._register(
      dynamicInjector.register(PLAN_MODE_INJECTION_VARIANT, async ({ lastInjectedAt: injectedAt }) => {
        const data = await this.plan.status();
        if (data === null) {
          if (!wasActive) return undefined;
          wasActive = false;
          return PLAN_MODE_EXIT_REMINDER;
        }
        const planFilePath = data.path;
        const isSpecification =
          data.deliveryPath !== undefined && this.flags.enabled(SPEC_CODING_FLAG_ID);
        if (!wasActive) {
          wasActive = true;
          if (data.content.trim().length > 0) {
            return reentryReminder(planFilePath, isSpecification);
          }
          return fullReminder(planFilePath, isSpecification);
        }
        const variant = planModeReminderVariant(injectedAt, this.context.get());
        if (variant === 'full') return fullReminder(planFilePath, isSpecification);
        if (variant === 'sparse') return sparseReminder(planFilePath, isSpecification);
        return undefined;
      }),
    );
  }
}

type PlanModeReminderVariant = 'full' | 'sparse';

function planModeReminderVariant(
  injectedAt: number | null,
  history: readonly ContextMessage[],
): PlanModeReminderVariant | null {
  if (injectedAt === null) return 'full';
  let assistantTurnsSince = 0;
  for (let i = injectedAt + 1; i < history.length; i++) {
    const message = history[i];
    if (message === undefined) continue;
    if (message.role === 'assistant') {
      assistantTurnsSince += 1;
      continue;
    }
    if (message.role === 'user') {
      return 'full';
    }
  }
  if (assistantTurnsSince >= PLAN_MODE_FULL_REFRESH_TURNS) return 'full';
  if (assistantTurnsSince >= PLAN_MODE_DEDUP_MIN_TURNS) return 'sparse';
  return null;
}

function withPlanFileFooter(
  body: string,
  planFilePath: PlanFilePath,
  isSpecification: boolean,
): string {
  if (planFilePath === null || planFilePath.length === 0) return body;
  const label = isSpecification ? 'Specification file' : 'Plan file';
  return `${body}\n\n${label}: ${planFilePath}`;
}

function fullReminder(planFilePath: PlanFilePath, isSpecification: boolean): string {
  if (planFilePath === null || planFilePath.length === 0) {
    return PLAN_MODE_INLINE_FULL_REMINDER;
  }
  return withPlanFileFooter(
    isSpecification ? SPECIFICATION_FULL_REMINDER : PLAN_MODE_FULL_REMINDER,
    planFilePath,
    isSpecification,
  );
}

function sparseReminder(planFilePath: PlanFilePath, isSpecification: boolean): string {
  if (planFilePath === null || planFilePath.length === 0) {
    return PLAN_MODE_INLINE_SPARSE_REMINDER;
  }
  return withPlanFileFooter(
    isSpecification ? SPECIFICATION_SPARSE_REMINDER : PLAN_MODE_SPARSE_REMINDER,
    planFilePath,
    isSpecification,
  );
}

function reentryReminder(planFilePath: PlanFilePath, isSpecification: boolean): string {
  if (planFilePath === null || planFilePath.length === 0) {
    return PLAN_MODE_INLINE_REENTRY_REMINDER;
  }
  return withPlanFileFooter(
    isSpecification ? SPECIFICATION_REENTRY_REMINDER : PLAN_MODE_REENTRY_REMINDER,
    planFilePath,
    isSpecification,
  );
}

const SPECIFICATION_FULL_REMINDER = `Plan mode is active. You MUST NOT make any edits (with the exception of the current specification file) or otherwise make changes to the system unless a tool request is explicitly approved. Prefer read-only tools. Use Bash only when needed; Bash follows the normal permission mode and rules. This supersedes any other instructions you have received. TaskStop, CronCreate, and CronDelete are also blocked in plan mode — call ExitPlanMode first if you need them.

Workflow:
  1. Understand — explore the codebase with Glob, Grep, Read.
  2. Design — converge on the best approach; consider trade-offs but aim for a single recommendation.
  3. Review — re-read key files to verify understanding.
  4. Write Specification — fill in the frontmatter (type, priority, mode), preserve the 用户原始描述, complete the 目标 and 验收标准 sections, and break the work into the 任务清单 checklist. Record sensible defaults in 关键决策 and unresolved high-risk questions in 待确认问题.
  5. Exit — call ExitPlanMode for user approval.

## Handling multiple approaches
Keep it focused: at most 2-3 meaningfully different approaches. Do NOT pad with minor variations — if one approach is clearly superior, just propose that one.
When the best approach depends on user preferences, constraints, or context you don't have, use AskUserQuestion to clarify first. When you do include multiple approaches in the specification, you MUST pass them as the \`options\` parameter when calling ExitPlanMode.

Use AskUserQuestion only for missing requirements or preferences that affect the specification. Never ask about plan approval via text or AskUserQuestion. Your turn must end with either AskUserQuestion (to clarify requirements or preferences) or ExitPlanMode (to request plan approval).`;

const SPECIFICATION_SPARSE_REMINDER = `Plan mode still active (see full instructions earlier). Prefer read-only tools except the current specification file. Use Write or Edit to modify the specification, keeping its task checklist and key decisions current. Use Bash only when needed; Bash follows the normal permission mode and rules. Use AskUserQuestion only when clarification materially improves the specification. End turns with AskUserQuestion (for clarifications) or ExitPlanMode (for approval). Never ask about plan approval via text or AskUserQuestion.`;

const SPECIFICATION_REENTRY_REMINDER = `Plan mode is active. You MUST NOT make any edits (with the exception of the current specification file) or otherwise make changes to the system unless a tool request is explicitly approved. Prefer read-only tools. Use Bash only when needed; Bash follows the normal permission mode and rules. This supersedes any other instructions you have received.

## Re-entering Plan Mode
A specification from a previous planning session already exists.
Before proceeding:
  1. Read the existing specification to understand what was previously planned.
  2. Evaluate the user's current request against that specification.
  3. If it is the same task, update the existing specification; otherwise replace it with a fresh specification.
  4. Use Write or Edit to keep the frontmatter, 用户原始描述, 目标, 验收标准, 任务清单, and 关键决策 complete.
  5. Use AskUserQuestion only to clarify missing requirements or preferences that affect the specification.
  6. Always edit the specification before calling ExitPlanMode.

Your turn must end with either AskUserQuestion (to clarify requirements) or ExitPlanMode (to request plan approval).`;
