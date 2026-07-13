export const SPEC_DELIVERY_STORE_KEY = 'specDelivery' as const;

export function finalizedSpecRunAt(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const finalizedAt = (value as Record<string, unknown>)['finalizedAt'];
  return typeof finalizedAt === 'string' ? finalizedAt : undefined;
}
