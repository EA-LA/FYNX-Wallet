const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public-site/app.js'), 'utf8');
const context = { window: { addEventListener() {} }, document: { querySelector() { return null; } }, location: { hash: '' } };
vm.createContext(context);
vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('render();connectFirebase();', ''), context);
function form() {
  const controls = { '#submit': {}, '#error': {}, '#email': { value: 'test@example.com' }, '#consent': { checked: true }, '#website': { value: '' } };
  return { controls, dataset: {}, isConnected: true, innerHTML: 'original form', reportValidity: () => true, querySelector: selector => controls[selector] };
}
function installSubmit(fn) { context.stubSubmit = fn; vm.runInContext('submitWaitlist = stubSubmit', context); }
const submit = f => context.handleWaitlistSubmit({ preventDefault() {}, currentTarget: f });
(async () => {
  let resolve, calls = 0;
  installSubmit(() => { calls++; return new Promise(r => { resolve = r; }); });
  const pending = form();
  const result = submit(pending);
  assert.equal(pending.innerHTML, 'original form');
  assert.equal(pending.controls['#submit'].disabled, true);
  await submit(pending);
  assert.equal(calls, 1);
  resolve({ ok: true }); await result;
  assert.match(pending.innerHTML, /You’re on the list/);
  for (const outcome of [undefined, { ok: false }, { ok: 'true' }, new Error('503 backend unavailable')]) {
    installSubmit(async () => { if (outcome instanceof Error) throw outcome; return outcome; });
    const failed = form(); await submit(failed);
    assert.equal(failed.innerHTML, 'original form');
    assert.match(failed.controls['#error'].textContent, /couldn’t confirm/);
    assert.equal(failed.controls['#submit'].disabled, false);
  }
  installSubmit(async () => { throw new Error('must not call without consent'); });
  const missing = form(); missing.controls['#consent'].checked = false;
  await submit(missing); assert.match(missing.controls['#error'].textContent, /confirm consent/);
  installSubmit(() => new Promise(r => { resolve = r; }));
  const detached = form(); const navigation = submit(detached); detached.isConnected = false;
  resolve({ ok: true }); await navigation; assert.equal(detached.innerHTML, 'original form');
  console.log('PASS: pending saves never show success, confirmed saves do, errors/unconfirmed responses remain retryable, repeated clicks are suppressed, and navigation cannot receive stale success.');
})().catch(error => { console.error(error); process.exit(1); });
