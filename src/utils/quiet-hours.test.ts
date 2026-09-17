import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hourInTimezone, isQuietHours } from './quiet-hours';

describe('quiet hours', () => {
  it('treats 23:00 UTC as quiet in UTC', () => {
    const date = new Date('2026-09-17T23:15:00.000Z');
    assert.equal(hourInTimezone(date, 'UTC'), 23);
    assert.equal(isQuietHours('UTC', date), true);
  });

  it('treats 12:00 UTC as not quiet in UTC', () => {
    const date = new Date('2026-09-17T12:00:00.000Z');
    assert.equal(isQuietHours('UTC', date), false);
  });
});
