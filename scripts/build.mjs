import fs from 'node:fs/promises';
export const assets = ['index.html','app.js','styles.css','shared.js','article-details.js','feed-refresh.js','article-state.js','terms.js','manifest.webmanifest','sw.js','icon-180.png','icon-192.png','icon-512.png'];
const root = new URL('../', import.meta.url), publicDir = new URL('../public/', import.meta.url);
await fs.mkdir(publicDir, {recursive:true});
for (const name of assets) await fs.copyFile(new URL(name, root), new URL(name, publicDir));
if (process.argv.includes('--pages')) {
  const snapshot = await fs.readFile(new URL('../data/feed.json',import.meta.url),'utf8');
  await fs.mkdir(new URL('data/',publicDir),{recursive:true});
  await fs.writeFile(new URL('data/feed.json',publicDir),snapshot);
  const html = await fs.readFile(new URL('index.html',publicDir),'utf8');
  await fs.writeFile(new URL('index.html',publicDir),html.replace('content="./api/feed"','content="./data/feed.json"'));
  await fs.writeFile(new URL('.nojekyll',publicDir),'');
}
console.log(`Built ${assets.length} public assets. Server code and .env are excluded.`);
