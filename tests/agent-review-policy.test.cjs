const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const target = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('lib/agent-review-policy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(target.exports);
const { canReview } = target.exports;
const ready = { enabled: true, connected: true, visible: true, count: 200, epoch: 100, now: 101000, nextReviewAt: 0, lastEpoch: 99, busy: false };
test('reviews only a fresh sample after explicit scanner start', () => {
  assert.equal(canReview(ready), true);
  for (const change of [{ enabled: false }, { connected: false }, { visible: false }, { count: 99 }, { epoch: 0 }, { now: 110000 }, { now: 97000 }]) {
    assert.equal(canReview({ ...ready, ...change }), false, JSON.stringify(change));
  }
});
test('prevents overlaps, repeated snapshots and cooldown bypass', () => {
  for (const change of [{ busy: true }, { lastEpoch: 100 }, { nextReviewAt: 102000 }]) {
    assert.equal(canReview({ ...ready, ...change }), false);
  }
  assert.equal(canReview({ ...ready, nextReviewAt: ready.now }), true);
});
