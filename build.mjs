// Builds the web app into dist/. The same folder is served on the web and packed into the phone apps.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
// HAVEN_API_URL is the friends server. Without it the app looks the address up from the website at start.
const api = (process.env.HAVEN_API_URL || '').trim().replace(/\/+$/, '');
if (api && !/^https:\/\/[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(api)) throw new Error('HAVEN_API_URL must be an https address.');

await rm('dist', { recursive: true, force: true });
await mkdir('dist/fonts', { recursive: true });
await build({
  entryPoints: ['src/app.js'], bundle: true, format: 'iife', target: ['es2022', 'safari16'], outfile: 'dist/app.js', minify: true, sourcemap: false,
  define: { __HAVEN_API__: JSON.stringify(api), __HAVEN_VERSION__: JSON.stringify(pkg.version) }, logLevel: 'info',
});
await build({ entryPoints: ['src/style.css'], bundle: true, external: ['./fonts/*'], outfile: 'dist/app.css', minify: true, logLevel: 'info' });
await cp('index.html', 'dist/index.html');
await cp('public', 'dist', { recursive: true });
await cp('node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', 'dist/fonts/bricolage.woff2');
await cp('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', 'dist/fonts/figtree.woff2');
// A copy of the app built before the server existed reads this file from the website to find it.
await writeFile('dist/config.json', JSON.stringify({ api: api || null, version: pkg.version }) + '\n');
const sw = await readFile('dist/sw.js', 'utf8');
await writeFile('dist/sw.js', sw.replace('__VERSION__', `${pkg.version}-${Date.now().toString(36)}`));
console.log(`Haven ${pkg.version} built into dist/. Friends server: ${api || 'looked up at start'}`);
