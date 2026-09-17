import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bboxRadiusM, expandBbox } from './bbox';

describe('expandBbox', () => {
  it('doubles the span around the center', () => {
    const bbox = { swLat: 55, swLng: 37, neLat: 56, neLng: 38 };
    const expanded = expandBbox(bbox, 2);
    assert.equal((expanded.neLat - expanded.swLat).toFixed(5), '2.00000');
    assert.ok(bboxRadiusM(expanded) > bboxRadiusM(bbox));
  });
});
