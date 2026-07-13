import type {
  SpecDevelopmentStrategy,
  SpecStrategyDecision,
} from '../../tools/builtin/state/spec-delivery';
import type { SpecTaskCategory } from '../../tools/builtin/state/spec-task-list';

interface StrategyRule {
  readonly strategy: SpecDevelopmentStrategy;
  readonly keywords: readonly string[];
  readonly recommendedQualityGate: SpecStrategyDecision['recommendedQualityGate'];
  readonly requiredTaskCategories: readonly SpecTaskCategory[];
}

const STRATEGY_RULES: readonly StrategyRule[] = [
  {
    strategy: 'release',
    keywords: ['release', 'deploy', 'publish', 'release note', '发布', '部署', '上线'],
    recommendedQualityGate: 'release',
    requiredTaskCategories: ['release_build', 'release_notes'],
  },
  {
    strategy: 'bug_diagnosis',
    keywords: ['bug', 'fix', 'error', 'exception', 'regression', 'crash', '修复', '排查', '故障', '异常'],
    recommendedQualityGate: 'strict',
    requiredTaskCategories: ['reproduction', 'root_cause', 'regression_test'],
  },
  {
    strategy: 'refactor',
    keywords: ['refactor', 'restructure', 'cleanup', '重构', '整理'],
    recommendedQualityGate: 'strict',
    requiredTaskCategories: ['behavior_preservation', 'regression_test'],
  },
  {
    strategy: 'review',
    keywords: ['review', 'audit', 'code review', '审查', '评审', '审核'],
    recommendedQualityGate: 'strict',
    requiredTaskCategories: ['review_findings', 'diff_review'],
  },
  {
    strategy: 'research',
    keywords: ['research', 'investigate', 'spike', 'explore', '调研', '研究', '探索'],
    recommendedQualityGate: 'fast',
    requiredTaskCategories: ['research_summary'],
  },
  {
    strategy: 'agile_mvp',
    keywords: ['mvp', 'prototype', 'proof of concept', 'poc', '原型', '最小可行'],
    recommendedQualityGate: 'fast',
    requiredTaskCategories: ['scope_validation', 'behavioral_verification'],
  },
  {
    strategy: 'planning',
    keywords: ['plan only', 'design only', '规划', '仅设计'],
    recommendedQualityGate: 'fast',
    requiredTaskCategories: ['planning_review'],
  },
];

export function routeSpecDevelopmentStrategy(
  specification: string,
  design: string,
): SpecStrategyDecision {
  const content = `${specification}\n${design}`.toLocaleLowerCase();
  for (const rule of STRATEGY_RULES) {
    const keyword = rule.keywords.find((candidate) => content.includes(candidate));
    if (keyword !== undefined) {
      return {
        strategy: rule.strategy,
        recommendedQualityGate: rule.recommendedQualityGate,
        requiredTaskCategories: rule.requiredTaskCategories,
        reasons: [`Matched "${keyword}" in the approved specification or design.`],
      };
    }
  }
  return {
    strategy: 'controlled_feature',
    recommendedQualityGate: 'standard',
    requiredTaskCategories: ['impact_analysis', 'behavioral_verification'],
    reasons: ['No specialized strategy signal matched; use the controlled feature workflow.'],
  };
}

export function formatSpecStrategyDecision(strategy: SpecStrategyDecision | null): string {
  if (strategy === null) return '';
  return `\n\nDevelopment strategy: ${strategy.strategy} (recommended quality gate: ${strategy.recommendedQualityGate}; required task categories: ${strategy.requiredTaskCategories.join(', ') || 'none'}). ${strategy.reasons.join(' ')}`;
}
