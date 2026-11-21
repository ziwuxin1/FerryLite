import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
// Run after Vite. Only the bundled handler and static artifacts enter the deployment.
await mkdir('dist-web/api', { recursive: true });
await build({ entryPoints: ['api/exclusive.mjs'], outfile: 'dist-web/api/exclusive.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: false });
await writeFile('dist-web/package.json', JSON.stringify({private:true,type:'module',engines:{node:'24.x'}}, null, 2));
console.log('Packaged web assets and exclusive server function (no credentials embedded).');
