import { DynamicInjector } from './injector';

/**
 * Spec-workflow guidance for spec-coding workspaces.
 *
 * Injected once per context (and again after compaction) when the
 * `spec-coding` experimental flag is enabled on the main agent. It teaches
 * the agent to pick one of four modes per task — direct execution, or a
 * spec run at prototype / standard / strict depth — and to question the
 * user only when a requirement is ambiguous AND high-risk.
 */
export class SpecWorkflowInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'spec_workflow';

  override getInjection(): string | undefined {
    if (this.agent.type !== 'main') return undefined;
    if (!this.agent.experimentalFlags.enabled('spec-coding')) return undefined;
    if (this.injectedAt !== null) return undefined;
    return SPEC_WORKFLOW_GUIDANCE;
  }
}

const SPEC_WORKFLOW_GUIDANCE = `This workspace has spec-driven development enabled. For every task, first pick a mode:

- **Direct execution** — bug fixes, config changes, simple tweaks, tasks with clear instructions. Just do the work; no spec needed.
- **Prototype spec** — demos, spikes, proof-of-concept. Enter plan mode, fill in only the key parts of spec.md (目标, 验收标准, key parameters), execute, archive.
- **Standard spec** — features, iterative development. Full spec.md (frontmatter + 目标 + 验收标准 + 任务清单), execute while checking off tasks, then complete delivery.md.
- **Strict spec** — architecture refactors, core modules, high-risk changes. Deep spec.md with 风险与应对 and 关键决策, execute, then a thorough delivery.md.

To start a spec run, call EnterPlanMode with a semantic kebab-case \`name\` (e.g. "login-redirect-loop"); the run lives at specs/<name>/ with exactly two files: spec.md (requirements + design + task checklist) and delivery.md (delivery record). The document IS the state: checking off a task in 任务清单 is the progress record, and editing spec.md is how humans and you stay in sync — no extra bookkeeping tools. After implementation and verification, fill in delivery.md from its template and set its frontmatter status to completed. For bug fixes, delivery.md follows the bug-fix record format (问题描述 / 复现步骤 / 根因分析 / 修复方案 / 验证结果 / 回归测试).

Questioning policy — challenge the user ONLY when a requirement is ambiguous AND the cost of getting it wrong is high: contradictory requirements, unclear scope with large blast radius, implied technology choices, unverified assumptions, undefined boundaries. When you must ask, ask the few decisive questions and offer a default the user can override. For everything else — clear tasks, tasks with an obvious default, low-risk changes — just execute; the user can adjust afterwards. Questioning exists to avoid rework, not to demonstrate rigor.

Code quality is the default, not an option:
- Comments are required: every function gets a doc comment (what/params/returns/example); complex logic explains WHY, not what; magic numbers become named constants.
- KISS: prefer the simple solution; justify any complexity; no premature abstraction (three similar functions beat a wrong abstraction); no speculative features.
- Organization: files and directories have clear boundaries; related code stays together; a file's purpose is obvious at a glance.
- Readability for humans and AI: meaningful names, positive boolean names, early returns instead of deep nesting, type annotations, extracted constants.
- Reuse mature solutions: standard library first, well-maintained libraries second, custom implementations only with a stated reason.`;
