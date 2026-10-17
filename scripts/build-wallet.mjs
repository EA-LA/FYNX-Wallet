import { build } from 'esbuild';
await build({ entryPoints: ['wallet-src/app.js'], bundle: true, outfile: 'wallet-assets/app.js', format: 'esm', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'linked', sourcemap: false });
console.log('Built the FYNX owner workspace.');
