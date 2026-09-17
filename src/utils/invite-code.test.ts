import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateInviteCode, inviteQuota, normalizeInviteCode } from './invite-code';

describe('invite-code', () => {
  it('generates 8 crockford chars', () => {
    const code = generateInviteCode((size) => Buffer.alloc(size, 1));
    assert.equal(code.length, 8);
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it('normalizes lookalike characters', () => {
    assert.equal(normalizeInviteCode('ilo'), '110');
  });

  it('caps quota at 25', () => {
    assert.equal(inviteQuota(0), 5);
    assert.equal(inviteQuota(10), 25);
    assert.equal(inviteQuota(20), 25);
  });
});
