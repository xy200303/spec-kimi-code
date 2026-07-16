import type {
  PermissionOption,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type { QuestionItem } from '@moonshot-ai/kimi-code-sdk';
import { describe, expect, it } from 'vitest';

import {
  outcomeToMultiSelectDecision,
  outcomeToQuestionAnswer,
  multiSelectOptionToPermissionOptions,
  questionItemToPermissionOptions,
} from '../src/question';

const sampleQuestion: QuestionItem = {
  question: 'Pick a flavour',
  options: [
    { label: 'Vanilla' },
    { label: 'Chocolate' },
    { label: 'Mint chip' },
  ],
};

function selected(optionId: string): RequestPermissionResponse {
  return { outcome: { outcome: 'selected', optionId } };
}

describe('questionItemToPermissionOptions', () => {
  it('maps each option to allow_once + a trailing Skip reject_once', () => {
    const opts = questionItemToPermissionOptions(sampleQuestion, 0);
    expect(opts).toHaveLength(4);
    expect(opts[0]).toEqual({
      optionId: 'q0_opt_0',
      name: 'Vanilla',
      kind: 'allow_once',
    });
    expect(opts[1]).toEqual({
      optionId: 'q0_opt_1',
      name: 'Chocolate',
      kind: 'allow_once',
    });
    expect(opts[2]).toEqual({
      optionId: 'q0_opt_2',
      name: 'Mint chip',
      kind: 'allow_once',
    });
    expect(opts[3]).toEqual({
      optionId: 'q0_skip',
      name: 'Skip',
      kind: 'reject_once',
    });
  });

  it('does not conflict across different questionIndex values', () => {
    const q0 = questionItemToPermissionOptions(sampleQuestion, 0);
    const q1 = questionItemToPermissionOptions(sampleQuestion, 1);
    const ids0 = q0.map((o: PermissionOption) => o.optionId);
    const ids1 = q1.map((o: PermissionOption) => o.optionId);
    const overlap = ids0.filter((id) => ids1.includes(id));
    expect(overlap).toEqual([]);
    expect(ids1).toEqual(['q1_opt_0', 'q1_opt_1', 'q1_opt_2', 'q1_skip']);
  });

  it('emits only the Skip option for a question with no options', () => {
    const empty: QuestionItem = { question: 'Empty?', options: [] };
    const opts = questionItemToPermissionOptions(empty, 0);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toEqual({
      optionId: 'q0_skip',
      name: 'Skip',
      kind: 'reject_once',
    });
  });
});

describe('outcomeToQuestionAnswer', () => {
  it('maps a selected q0_opt_<i> to { question: options[i].label }', () => {
    expect(outcomeToQuestionAnswer(sampleQuestion, 0, selected('q0_opt_2'))).toEqual({
      'Pick a flavour': 'Mint chip',
    });
    expect(outcomeToQuestionAnswer(sampleQuestion, 0, selected('q0_opt_0'))).toEqual({
      'Pick a flavour': 'Vanilla',
    });
  });

  it('maps q0_skip to null', () => {
    expect(outcomeToQuestionAnswer(sampleQuestion, 0, selected('q0_skip'))).toBeNull();
  });

  it('maps cancelled to null', () => {
    expect(
      outcomeToQuestionAnswer(sampleQuestion, 0, { outcome: { outcome: 'cancelled' } }),
    ).toBeNull();
  });

  it('maps an unknown optionId to null', () => {
    expect(outcomeToQuestionAnswer(sampleQuestion, 0, selected('wat'))).toBeNull();
    expect(
      outcomeToQuestionAnswer(sampleQuestion, 0, selected('approve_once')),
    ).toBeNull();
  });

  it('defensively maps an out-of-bounds index to null', () => {
    expect(outcomeToQuestionAnswer(sampleQuestion, 0, selected('q0_opt_99'))).toBeNull();
  });
});

describe('multiSelectOptionToPermissionOptions', () => {
  it('creates distinct select and skip options for one sequential multi-select item', () => {
    expect(multiSelectOptionToPermissionOptions(2, 3, 'TypeScript')).toEqual([
      { optionId: 'q2_multi_3_select', name: 'Select TypeScript', kind: 'allow_once' },
      { optionId: 'q2_multi_3_skip', name: 'Do not select TypeScript', kind: 'reject_once' },
    ]);
  });
});

describe('outcomeToMultiSelectDecision', () => {
  it('maps the selected and unselected outcomes for one option', () => {
    expect(outcomeToMultiSelectDecision(2, 3, selected('q2_multi_3_select'))).toBe(true);
    expect(outcomeToMultiSelectDecision(2, 3, selected('q2_multi_3_skip'))).toBe(false);
  });

  it('returns null when the multi-select interaction is cancelled', () => {
    expect(outcomeToMultiSelectDecision(2, 3, { outcome: { outcome: 'cancelled' } })).toBeNull();
  });
});
