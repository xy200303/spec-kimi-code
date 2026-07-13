import type { Agent } from '../..';
import type { PermissionPolicy, PermissionPolicyContext, PermissionPolicyResult } from '../types';
import { writeFileAccesses } from './file-access-ask';

export class PlanModeGuardDenyPermissionPolicy implements PermissionPolicy {
  readonly name = 'plan-mode-guard-deny';

  constructor(private readonly agent: Agent) {}

  evaluate(context: PermissionPolicyContext): PermissionPolicyResult | undefined {
    if (!this.agent.planMode.isActive) return;

    const toolName = context.toolCall.name;
    if (toolName === 'Write' || toolName === 'Edit') {
      const writableFilePaths = this.agent.planMode.writableFilePaths;
      if (writableFilePaths.length === 0) {
        return {
          kind: 'deny',
          message: planModeWriteDeniedMessage(writableFilePaths),
        };
      }
      if (writesOnlyPlanFiles(context, writableFilePaths)) {
        return;
      }
      return {
        kind: 'deny',
        message: planModeWriteDeniedMessage(writableFilePaths),
      };
    }

    if (toolName === 'TaskStop') {
      return {
        kind: 'deny',
        message:
          'TaskStop is not available in plan mode. Call ExitPlanMode to exit plan mode before stopping a background task.',
      };
    }

    if (toolName === 'CronCreate' || toolName === 'CronDelete') {
      return {
        kind: 'deny',
        message:
          `${toolName} is not available in plan mode because it would mutate scheduled work that runs after plan exit. Call ExitPlanMode first.`,
      };
    }

    return;
  }
}

function writesOnlyPlanFiles(
  context: PermissionPolicyContext,
  planFilePaths: readonly string[],
): boolean {
  const writeAccesses = writeFileAccesses(context);
  if (writeAccesses.length === 0) return false;
  return writeAccesses.every((access) => planFilePaths.includes(access.path));
}

function planModeWriteDeniedMessage(writableFilePaths: readonly string[]): string {
  const paths = writableFilePaths.length === 0 ? '(no writable planning documents selected yet)' : writableFilePaths.join(', ');
  return (
    `Plan mode is active. You may only write to the current planning documents: ${paths}. ` +
    'Call ExitPlanMode to exit plan mode before editing other files.'
  );
}
