import type {
  SpecDevelopmentStrategy,
  SpecStrategyDecision,
} from '../../tools/builtin/state/spec-delivery';

interface StrategyRule {
  readonly strategy: SpecDevelopmentStrategy;
  readonly keywords: readonly string[];
  readonly recommendedQualityGate: SpecStrategyDecision['recommendedQualityGate'];
}

const STRATEGY_RULES: readonly StrategyRule[] = [
  {
    strategy: 'release',
    keywords: ['release', 'deploy', 'publish', 'release note', '发布', '部署', '上线'],
    recommendedQualityGate: 'release',
  },
  {
    strategy: 'bug_diagnosis',
    keywords: ['bug', 'fix', 'error', 'exception', 'regression', 'crash', '修复', '排查', '故障', '异常'],
    recommendedQualityGate: 'strict',
  },
  {
    strategy: 'refactor',
    keywords: ['refactor', 'restructure', 'cleanup', '重构', '整理'],
    recommendedQualityGate: 'strict',
  },
  {
    strategy: 'review',
    keywords: ['review', 'audit', 'code review', '审查', '评审', '审核'],
    recommendedQualityGate: 'strict',
  },
  {
    strategy: 'research',
    keywords: ['research', 'investigate', 'spike', 'explore', '调研', '研究', '探索'],
    recommendedQualityGate: 'fast',
  },
  {
    strategy: 'agile_mvp',
    keywords: ['mvp', 'prototype', 'proof of concept', 'poc', '原型', '最小可行'],
    recommendedQualityGate: 'fast',
  },
  {
    strategy: 'planning',
    keywords: ['plan only', 'design only', '规划', '仅设计'],
    recommendedQualityGate: 'fast',
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
        reasons: [`Matched "${keyword}" in the approved specification or design.`],
      };
    }
  }
  return {
    strategy: 'controlled_feature',
    recommendedQualityGate: 'standard',
    reasons: ['No specialized strategy signal matched; use the controlled feature workflow.'],
  };
}

export function formatSpecStrategyDecision(strategy: SpecStrategyDecision | null): string {
  if (strategy === null) return '';
  return `\n\nDevelopment strategy: ${strategy.strategy} (recommended quality gate: ${strategy.recommendedQualityGate}). ${strategy.reasons.join(' ')}`;
}
