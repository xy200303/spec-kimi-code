import type { Agent } from '../..';
import type { PermissionPolicy, PermissionPolicyContext, PermissionPolicyResult } from '../types';
import {
  SPEC_TASK_ACTIVE_STORE_KEY,
  SPEC_TASK_STORE_KEY,
  type SpecTask,
} from '../../../tools/builtin/state/spec-task-list';

const RISK_CONTROLLED_TOOLS = new Set(['Write', 'Edit', 'Bash', 'Agent', 'AgentSwarm']);

export class SpecTaskHighRiskAskPermissionPolicy implements PermissionPolicy {
  readonly name = 'spec-task-high-risk-ask';

  constructor(private readonly agent: Agent) {}

  evaluate(context: PermissionPolicyContext): PermissionPolicyResult | undefined {
    const task = activeRiskTask(this.agent, context);
    if (task?.risk !== 'high') return;
    return {
      kind: 'ask',
      reason: specTaskRiskReason(task),
    };
  }
}

export class SpecTaskLowRiskApprovePermissionPolicy implements PermissionPolicy {
  readonly name = 'spec-task-low-risk-approve';

  constructor(private readonly agent: Agent) {}

  evaluate(context: PermissionPolicyContext): PermissionPolicyResult | undefined {
    const task = activeRiskTask(this.agent, context);
    if (task?.risk !== 'low') return;
    return {
      kind: 'approve',
      reason: specTaskRiskReason(task),
    };
  }
}

function activeRiskTask(agent: Agent, context: PermissionPolicyContext): SpecTask | undefined {
  if (!agent.experimentalFlags.enabled('spec-coding')) return;
  if (!RISK_CONTROLLED_TOOLS.has(context.toolCall.name)) return;

  const state = agent.tools.storeData();
  const activeTaskId = state[SPEC_TASK_ACTIVE_STORE_KEY];
  if (typeof activeTaskId !== 'string') return;
  const tasks = state[SPEC_TASK_STORE_KEY];
  if (!Array.isArray(tasks)) return;
  return tasks.find((task): task is SpecTask => isSpecTask(task) && task.id === activeTaskId);
}

function specTaskRiskReason(task: SpecTask) {
  return {
    spec_task_id: task.id,
    spec_task_risk: task.risk ?? 'medium',
  };
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
