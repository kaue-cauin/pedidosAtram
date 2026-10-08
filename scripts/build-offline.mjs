import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
const paths = (await files('out')).filter(p => /\.(js|css|woff2?|svg)$/.test(p) && !p.endsWith('/sw.js')).sort();
const pages = ['out/index.html', 'out/diagnostico/index.html'];
const hash = createHash('sha256');
for (const path of [...pages, ...paths]) hash.update(await readFile(path));
const version = hash.digest('hex').slice(0, 16);
const assets = [`${base}/`, `${base}/diagnostico/`, ...paths.map(p => `${base}/${p.slice(4)}`)];
const template = await readFile('scripts/offline-runtime.js', 'utf8');
await writeFile('out/sw.js', template.replace('__ASSETS__', JSON.stringify(assets)).replace('__VERSION__', JSON.stringify(version)));
console.log(`Offline: ${assets.length} arquivos, versão ${version}, escopo ${base || '/'}`);
