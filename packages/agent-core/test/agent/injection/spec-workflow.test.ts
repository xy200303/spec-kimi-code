import { describe, expect, it, vi } from 'vitest';

import { SpecWorkflowInjector } from '../../../src/agent/injection/spec-workflow';
import type { ExperimentalFlagResolver } from '../../../src/flags';
import { testAgent } from '../harness/agent';

function fakeFlags(enabled: boolean, ids: readonly string[] = []): ExperimentalFlagResolver {
  return {
    enabled: vi.fn(() => enabled),
    enabledIds: vi.fn(() => ids as string[]),
    snapshot: vi.fn(() => ({})),
    explain: vi.fn(() => undefined),
    explainAll: vi.fn(() => []),
    setConfigOverrides: vi.fn(),
  } as unknown as ExperimentalFlagResolver;
}

describe('SpecWorkflowInjector', () => {
  it('injects adaptive intent clarification guidance when spec-coding is enabled', () => {
    const ctx = testAgent({
      experimentalFlags: fakeFlags(true, ['spec-coding']),
    });
    ctx.configure();
    const injector = new SpecWorkflowInjector(ctx.agent);

    const injection = (injector as unknown as { getInjection(): string | undefined }).getInjection();

    expect(injection).toBeDefined();
    expect(injection).toContain('Adaptive intent clarification');
    expect(injection).toContain('paraphrase');
    expect(injection).toContain('AskUserQuestion');
    expect(injection).toContain('simple, well-scoped tasks');
  });

  it('does not inject guidance when spec-coding is disabled', () => {
    const ctx = testAgent({
      experimentalFlags: fakeFlags(false, []),
    });
    ctx.configure();
    const injector = new SpecWorkflowInjector(ctx.agent);

    const injection = (injector as unknown as { getInjection(): string | undefined }).getInjection();

    expect(injection).toBeUndefined();
  });
});
