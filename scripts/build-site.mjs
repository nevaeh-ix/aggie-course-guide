import {cp, mkdir, rm} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, {recursive: true, force: true});
await mkdir(dist, {recursive: true});

// Copy just the files the browser needs.
const files = [
  'index.html', 'app.js', 'styles.css', 'engine.mjs', 'retrieval.mjs',
  'conversation.mjs', 'ai-worker.js', 'catalog.json', 'embeddings.json',
  'THIRD_PARTY_NOTICES.txt', 'vendor', 'models'
];

for (const file of files) {
  await cp(new URL(file, root), new URL(file, dist), {recursive: true});
}

console.log('Built the course guide in dist/.');
