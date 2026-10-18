import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { buildPages, publicFiles } from '../scripts/build-pages.mjs';
const revision = 'a'.repeat(40);
async function fixture(work) {
  const root = await mkdtemp(resolve(tmpdir(), 'fynx-pages-'));
  try {
    for (const name of publicFiles) { const target = resolve(root, name); await mkdir(dirname(target), { recursive: true }); await copyFile(new URL(`../${name}`, import.meta.url), target); }
    await work(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('Release artifact publishes only approved assets; hidden/source/backend fixtures stay out', () => fixture(async root => {
  for (const name of ['.env', 'firebase-wallet/functions/index.js', 'wallet-src/dashboard/index.html', 'output/private.txt']) { const file = resolve(root, name); await mkdir(dirname(file), { recursive: true }); await writeFile(file, 'DO NOT PUBLISH'); }
  const result = await buildPages(root, revision);
  const paths = (await readdir(result.output, { recursive: true })).filter(p => !['public-site', 'wallet-assets'].includes(p));
  assert.deepEqual(new Set(paths), new Set([...publicFiles, '.nojekyll', 'release-manifest.json']));
  const manifest = JSON.parse(await readFile(resolve(result.output, 'release-manifest.json')));
  assert.equal(manifest.revision, revision); assert.equal(Object.keys(manifest.files).length, publicFiles.length);
}));
test('Known private credentials, debug activation, and broken asset links stop publication', () => fixture(async root => {
  const file = resolve(root, 'public-site/app.js'), original = await readFile(file);
  for (const text of ['-----BEGIN PRIVATE KEY-----', 'self.FIREBASE_APPCHECK_DEBUG_TOKEN = true', 'window.fynxTestSignIn = token => token']) {
    await writeFile(file, text); await assert.rejects(buildPages(root, revision), /Private credential or acceptance-test code/);
  }
  await writeFile(file, original);
  await writeFile(resolve(root, 'owner.html'), '<script src="missing.js"></script>');
  await assert.rejects(buildPages(root, revision), /Unpublished local dependency/);
}));
test('A symlinked asset cannot pull files outside the approved source', () => fixture(async root => {
  const file = resolve(root, 'favicon.svg'); await rm(file); await symlink(resolve(root, 'owner.html'), file);
  await assert.rejects(buildPages(root, revision), /Symlinks cannot be published/);
}));
