import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './build-checklist.mjs';

const source = await readFile('wallet-src/dashboard/app.js', 'utf8');
const script = source.replace(/<\/script/gi, '<\\/script');
const scriptHash = `sha256-${createHash('sha256').update(script).digest('base64')}`;
const template = await readFile('wallet-src/dashboard/index.html', 'utf8');
const style = await readFile('wallet-src/dashboard/styles.css', 'utf8');
const dashboard = template.replace('__SCRIPT_HASH__', scriptHash).replace('__STYLE__', () => style).replace('__SCRIPT__', () => script);
await writeFile('firebase-wallet/functions/dashboard.html', dashboard);
// srcdoc inherits its parent's CSP: allow only this exact preview script, never arbitrary inline JS.
await build({ entryPoints: ['wallet-src/app.js'], bundle: true, outfile: 'wallet-assets/app.js', format: 'esm', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'linked', sourcemap: false });
const owner = await readFile('owner.html', 'utf8');
const assetVersion = async path => createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 16);
const ownerVersion = await assetVersion('wallet-assets/app.js');
const styleVersion = await assetVersion('wallet-assets/styles.css');
await writeFile('owner.html', owner
  .replace(/script-src 'self'(?: 'sha256-[^']+')?/, `script-src 'self' '${scriptHash}'`)
  .replace(/src="wallet-assets\/app\.js(?:\?v=[^"]+)?"/, `src="wallet-assets/app.js?v=${ownerVersion}"`)
  .replace(/href="wallet-assets\/styles\.css(?:\?v=[^"]+)?"/, `href="wallet-assets/styles.css?v=${styleVersion}"`));
const privacy = await readFile('wallet-privacy.html', 'utf8');
await writeFile('wallet-privacy.html', privacy.replace(/href="wallet-assets\/styles\.css(?:\?v=[^"]+)?"/, `href="wallet-assets/styles.css?v=${styleVersion}"`));
console.log('Built the owner workspace and protected dashboard document.');
