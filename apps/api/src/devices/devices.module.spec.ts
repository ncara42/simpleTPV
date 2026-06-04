import { describe, expect, it } from 'vitest';

import { DevicesModule } from './devices.module.js';

describe('DevicesModule', () => {
  it('queda definido', () => {
    expect(DevicesModule).toBeDefined();
  });
});
