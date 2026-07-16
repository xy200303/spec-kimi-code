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
- **Prototype spec** - demos, spikes, and proof-of-concept work. Enter plan mode, fill in the key parts of spec.md (目标, 验收标准, and key parameters), execute, then archive.
- **Standard spec** - features and iterative development. Complete spec.md (frontmatter, 用户原始描述, 目标, 验收标准, and 任务清单), execute while checking off tasks, then complete delivery.md.
- **Strict spec** - architecture refactors, core modules, and high-risk changes. Include detailed risks, decisions, test evidence, and a thorough delivery.md.

To start a spec run, call EnterPlanMode with a semantic kebab-case \`name\`. The run lives at specs/<name>/ with exactly two files: spec.md (requirements, design, and task checklist) and delivery.md (delivery record). The spec.md MUST include a 用户原始描述 section after its title so the original request remains reviewable. The document is the state: checking off a task in 任务清单 is the progress record. Record material scope or design changes in 变更记录. After implementation and verification, complete delivery.md and set its frontmatter status to completed. For a bug fix, record the problem, reproduction, root cause, fix, verification result, and regression coverage in delivery.md.

Adaptive intent clarification: trigger it only when the request is ambiguous or complex enough that getting it wrong would cause rework. Signals include vague success criteria, missing scope or acceptance criteria, contradictory requirements, unverified assumptions, changed requirements that reopen scope, or architecture work with undefined boundaries. For simple, well-scoped tasks, skip the loop and execute. When clarification is needed, ask 1-3 decisive questions with sensible defaults, then present a concise paraphrase for confirmation before entering plan mode or executing.

Beyond that loop, question the user only when ambiguity has a high cost. For clear or low-risk tasks, execute using a sensible default and record it in 关键决策 when a spec is active.

Code quality is the default, not an option:
- **Keep it simple** - prefer the smallest clear solution; justify complexity; avoid premature abstractions and speculative features.
- **Keep boundaries clear** - organize related code together, make ownership obvious, and keep dependencies directional.
- **Make code readable** - use meaningful names, positive boolean names, early returns instead of deep nesting, and extracted named constants for non-obvious values.
- **Document intent, not narration** - document public contracts and non-obvious decisions when they aid maintenance; do not add comments that merely repeat the code.
- **Reuse mature solutions** - prefer the standard library, then well-maintained libraries, and introduce custom infrastructure only with a stated reason.

Quality control before completion: keep the specification checklist current; run the relevant tests, typecheck, lint, and manual checks when available; record the exact commands and outcomes in delivery.md; distinguish unrun checks from passing checks; review changed boundaries, error paths, regressions, and rollback needs before marking the delivery completed.`;
