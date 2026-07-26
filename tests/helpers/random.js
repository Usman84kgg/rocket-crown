import { vi } from 'vitest';

/**
 * Force `crypto.getRandomValues` to yield the given 32 bit values in order,
 * repeating the last one, so game outcomes become deterministic.
 */
export function stubRandomValues(...values) {
  let index = 0;
  const spy = vi.fn((array) => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    array[0] = value;
    return array;
  });
  vi.stubGlobal('crypto', { ...globalThis.crypto, getRandomValues: spy });
  return spy;
}
