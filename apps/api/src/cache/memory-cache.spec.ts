import { describe, expect, it } from 'vitest';

import { MemoryCache } from './memory-cache.js';

describe('MemoryCache', () => {
  it('set/get/del sobre el Map interno', async () => {
    const cache = new MemoryCache();
    expect(await cache.get('k')).toBeNull();

    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');

    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });
});
