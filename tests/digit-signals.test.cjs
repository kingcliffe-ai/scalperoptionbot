const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const compiled = ts.transpileModule(fs.readFileSync('lib/digit-signals.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const target = { exports: {} };
new Function('exports', compiled)(target.exports);
const { analyzeDigits } = target.exports;

test('requires a minimum history and waits on uniform digits', () => {
  assert.equal(analyzeDigits([], 'matches-differs').status, 'warming');
  const balanced = Array.from({ length: 200 }, (_, i) => i % 10);
  for (const type of ['matches-differs', 'over-under', 'even-odd']) {
    const result = analyzeDigits(balanced, type);
    assert.equal(result.status, 'wait');
    assert.equal(result.excess, 0);
  }
});
test('observes sustained imbalances without calling them predictions', () => {
  const result = analyzeDigits(Array(200).fill(7), 'matches-differs');
  assert.equal(result.status, 'observe');
  assert.equal(result.mode, 'DIGITMATCH');
  assert.equal(result.digit, 7);
  assert.equal(result.rate, 1);
  assert.equal(result.baseline, 0.1);
});
test('recent reversal does not inherit a historical entry', () => {
  const result = analyzeDigits([...Array(150).fill(7), ...Array.from({ length: 50 }, (_, i) => i % 10)], 'matches-differs');
  assert.equal(result.status, 'wait');
});
test('caps history and never chooses impossible over/under barriers', () => {
  const result = analyzeDigits(Array(400).fill(0), 'over-under');
  assert.equal(result.count, 200);
  assert.ok(result.mode === 'DIGITOVER' ? result.digit < 9 : result.digit > 0);
  assert.ok(result.baseline > 0 && result.baseline < 1);
});
