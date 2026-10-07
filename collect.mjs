import fs from 'node:fs/promises';
import config from '../sources.json' with {type:'json'};
import {collectFeed} from '../lib/collect-feed.mjs';
import {fetchJson} from '../lib/transport.mjs';
import {sanitizeSnapshot,sourceCacheFromSnapshot,preserveSnapshotOnFailure} from '../lib/snapshot.mjs';

const directory = new URL('../data/',import.meta.url),path = new URL('feed.json',directory);
let previous;
try {previous = sanitizeSnapshot(JSON.parse(await fs.readFile(path,'utf8')));} catch {}
if (!previous && process.env.PREVIOUS_FEED_URL) {
  try {previous = sanitizeSnapshot(await fetchJson(process.env.PREVIOUS_FEED_URL,{timeoutMs:8000}));} catch {}
}
// 無料の公開データ生成では、有料AIプロバイダーを呼び出しません。
const collected = await collectFeed(config,{previous:sourceCacheFromSnapshot(previous),env:{SUMMARIZER:'rules'},timeoutMs:12000});
const snapshot = sanitizeSnapshot(preserveSnapshotOnFailure(collected,previous));
await fs.mkdir(directory,{recursive:true});
await fs.writeFile(path,`${JSON.stringify(snapshot,null,2)}\n`);
console.log(JSON.stringify({generatedAt:snapshot.generatedAt,articles:snapshot.articles.length,sources:snapshot.sources.map(source => ({name:source.name,status:source.status,count:source.count})),paidAiCalls:0},null,2));
if (!snapshot.articles.length) process.exitCode = 1;
