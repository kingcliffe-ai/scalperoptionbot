const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
function load(path, requireMock) {
  const target = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', code)(target.exports, requireMock);
  return target.exports;
}
const signals = load('lib/digit-signals.ts');
let calls = 0;
let content = JSON.stringify({ market: 'Wait for window agreement.', risk: 'Review the live payout before approving a purchase.' });
class MockOpenAI {
  chat = { completions: { create: async () => { calls++; return { choices: [{ message: { content } }] }; } } };
}
const { POST } = load('app/api/digit-signals/route.ts', name => name === 'openai' ? MockOpenAI : signals);
function request(body, origin = 'https://bot.example') {
  return new Request('https://bot.example/api/digit-signals', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
const valid = { digits: Array.from({ length: 200 }, (_, i) => i % 10), tradeType: 'even-odd' };
test('rejects invalid input and foreign origins before calling AI', async () => {
  for (const [input, status] of [[request(valid, 'https://elsewhere.example'), 403], [request('{'), 400], [request(null), 400], [request({ ...valid, digits: [99] }), 400], [request({ ...valid, tradeType: 'invalid' }), 400], [request('x'.repeat(4097)), 413]]) {
    assert.equal((await POST(input)).status, status);
  }
  assert.equal(calls, 0);
});
test('returns both validated review roles without caching', async () => {
  const response = await POST(request(valid));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).review, JSON.parse(content));
});
test('fails visibly when AI returns an incomplete review', async () => {
  content = JSON.stringify({ market: 'Incomplete' });
  const response = await POST(request(valid));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /unavailable/);
});
