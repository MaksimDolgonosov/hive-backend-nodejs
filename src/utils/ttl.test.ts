import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { combineTtlSec, ttlSecFromStings24h, TTL_4H_SEC, TTL_24H_SEC, TTL_72H_SEC } from './ttl';

describe('ttlSecFromStings24h', () => {
  it('uses 72h for empty zones', () => {
    assert.equal(ttlSecFromStings24h(0), TTL_72H_SEC);
    assert.equal(ttlSecFromStings24h(4), TTL_72H_SEC);
  });

  it('uses 24h for cold zones', () => {
    assert.equal(ttlSecFromStings24h(5), TTL_24H_SEC);
    assert.equal(ttlSecFromStings24h(19), TTL_24H_SEC);
  });

  it('uses 4h for dense zones', () => {
    assert.equal(ttlSecFromStings24h(60), TTL_4H_SEC);
  });

  it('caps combined ttl at 72h', () => {
    assert.equal(combineTtlSec({ baseSec: TTL_72H_SEC, campaignBonusSec: 14_400, hiveBonusSec: 10_000 }), TTL_72H_SEC);
  });
});
