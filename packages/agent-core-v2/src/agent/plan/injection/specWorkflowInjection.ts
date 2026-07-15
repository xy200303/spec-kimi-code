/**
 * `plan` domain (L4) — spec-coding workflow context injection.
 *
 * Adds one main-agent reminder per context while the spec-coding flag is on.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IFlagService } from '#/app/flag/flag';
import { SPEC_CODING_FLAG_ID } from '#/agent/plan/flag';

const SPEC_WORKFLOW_VARIANT = 'spec_workflow';
const MAIN_AGENT_ID = 'main';

export class SpecWorkflowInjection extends Disposable {
  constructor(
    dynamicInjector: IAgentContextInjectorService,
    flags: IFlagService,
    agentId: string,
  ) {
    super();
    this._register(
      dynamicInjector.register(SPEC_WORKFLOW_VARIANT, ({ lastInjectedAt }) => {
        if (
          agentId !== MAIN_AGENT_ID ||
          !flags.enabled(SPEC_CODING_FLAG_ID) ||
          lastInjectedAt !== null
        ) {
          return undefined;
        }
        return SPEC_WORKFLOW_GUIDANCE;
      }),
    );
  }
}

const SPEC_WORKFLOW_GUIDANCE = `This workspace has spec-driven development enabled. For every task, first pick a mode:

- **Direct execution** - bug fixes, config changes, simple tweaks, and clear tasks. Just do the work; no spec needed.
- **Prototype spec** - demos, spikes, and proof-of-concept work. Enter plan mode, fill in the key parts of spec.md, execute, then archive.
- **Standard spec** - features and iterative development. Complete spec.md, execute while checking off tasks, then complete delivery.md.
- **Strict spec** - architecture refactors, core modules, and high-risk changes. Include detailed risks and decisions, then a thorough delivery.md.

To start a spec run, call EnterPlanMode with a semantic kebab-case \`name\`. The run lives at specs/<name>/ with exactly two files: spec.md (requirements, design, and task checklist) and delivery.md (delivery record). The spec.md MUST include a "用户原始描述" section after its title so the original request remains reviewable. The document is the state: checking off a task in 任务清单 is the progress record. After implementation and verification, complete delivery.md and set its frontmatter status to completed.

Adaptive intent clarification: only when a requirement is ambiguous or complex enough that getting it wrong would cause rework, ask 1-3 decisive questions with sensible defaults. After receiving answers, present a concise paraphrase and ask for confirmation before entering plan mode or executing. Skip this loop for simple, well-scoped tasks.

Beyond that loop, question the user only when ambiguity has a high cost: contradictory requirements, unclear scope with broad impact, unverified assumptions, or undefined boundaries. For clear or low-risk tasks, execute using a sensible default and record it in 关键决策 when a spec is active.

Code quality is the default: prefer simple solutions, clear boundaries, meaningful names, and mature libraries over speculative abstractions.`;
