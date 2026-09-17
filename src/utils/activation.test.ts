import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeHiveActivation, isHiveCluster } from './activation';

const options = { authorWeightCap: 2, activationThreshold: 3 };

describe('computeHiveActivation', () => {
  it('keeps a solo stack as seed', () => {
    const stats = computeHiveActivation(['a', 'a', 'a'], options);
    assert.equal(stats.activationCount, 2);
    assert.equal(stats.contributorsCount, 1);
    assert.equal(stats.stage, 'seed');
    assert.equal(isHiveCluster(stats), true);
  });

  it('ignites with two authors', () => {
    const stats = computeHiveActivation(['a', 'a', 'b'], options);
    assert.equal(stats.activationCount, 3);
    assert.equal(stats.stage, 'hive');
  });

  it('does not cluster a single sting', () => {
    const stats = computeHiveActivation(['a'], options);
    assert.equal(isHiveCluster(stats), false);
  });
});
