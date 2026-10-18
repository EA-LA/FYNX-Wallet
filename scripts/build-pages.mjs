import { lstat, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const publicFiles = Object.freeze([
  'index.html', 'owner.html', 'wallet-privacy.html',
  'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
  'public-site/app.js', 'public-site/firebase-config.js', 'public-site/styles.css',
  'wallet-assets/app.js', 'wallet-assets/app.js.LEGAL.txt', 'wallet-assets/styles.css',
]);

export async function buildPages(root = process.cwd(), revision) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('A full Git revision is required for the Pages release.');
  const files = new Map();
  for (const name of publicFiles) {
    let current = resolve(root);
    for (const part of name.split('/')) {
      current = resolve(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlinks cannot be published: ${name}`);
    }
    const bytes = await readFile(current);
    if (['.js', '.html', '.txt', '.svg'].includes(extname(name))) {
      const text = bytes.toString('utf8');
      if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|"type"\s*:\s*"service_account"|(?:window|self|globalThis)\.FIREBASE_APPCHECK_DEBUG_TOKEN\s*=(?!=)\s*(?:true|['"])|(?:window\.)?fynxTest(?:SignIn|Call)|sk_(?:live|test)_[A-Za-z0-9]{16,}/.test(text)) throw new Error(`Private credential or acceptance-test code detected: ${name}`);
    }
    files.set(name, bytes);
  }
  for (const name of ['index.html', 'owner.html', 'wallet-privacy.html']) {
    for (const [, target] of files.get(name).toString().matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const local = target.split(/[?#]/)[0].replace(/^\.\//, '') || 'index.html';
      if (!files.has(local)) throw new Error(`Unpublished local dependency in ${name}: ${target}`);
    }
  }
  const hashes = Object.fromEntries([...files].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
  const output = resolve(root, '_site');
  // Rebuild only the fixed artifact directory; never upload the repository checkout.
  await rm(output, { recursive: true, force: true });
  for (const [name, bytes] of files) {
    const target = resolve(output, name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
  await writeFile(resolve(output, '.nojekyll'), '');
  await writeFile(resolve(output, 'release-manifest.json'), JSON.stringify({ repository: 'EA-LA/FYNX-Wallet', revision, files: hashes }, null, 2) + '\n');
  return { output, files: [...files.keys()], revision };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = await buildPages(process.cwd(), revision);
  console.log(`Prepared ${result.files.length} approved public files for GitHub Pages (${revision.slice(0, 7)}).`);
}
