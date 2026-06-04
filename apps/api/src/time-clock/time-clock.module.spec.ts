import { describe, expect, it } from 'vitest';

import { TimeClockModule } from './time-clock.module.js';

describe('TimeClockModule', () => {
  it('queda definido', () => {
    expect(TimeClockModule).toBeDefined();
  });
});
