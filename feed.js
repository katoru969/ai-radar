import config from '../sources.json' with {type:'json'};
import {collectFeed} from '../lib/collect-feed.mjs';

const TTL = 15 * 60000;
const previous = new Map();
let cached, pending;
export async function getFeed() {
  if (cached && Date.now() - Date.parse(cached.checkedAt) < TTL) return cached;
  if (pending) return pending;
  pending = (async () => {
    const result = await collectFeed(config,{previous,env:process.env,timeoutMs:Math.max(1000,Math.min(12000,Number(process.env.FEED_TIMEOUT_MS) || 8000))});
    // 全取得失敗を長時間キャッシュしない。成功した接続先の結果は保持する。
    if (result.articles.length) cached = result;
    return result;
  })();
  try {return await pending;} finally {pending = undefined;}
}
export default async function handler(req,res) {
  if (!['GET','HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD'); return res.status(405).json({error:'method_not_allowed'});}
  try {
    const feed = await getFeed();
    res.setHeader('Cache-Control',feed.articles.length ? 'public, max-age=0, s-maxage=900, stale-while-revalidate=1800' : 'no-store');
    if (req.method === 'HEAD') {res.status(200); return res.end();}
    return res.status(200).json(feed);
  } catch {return res.status(503).json({error:'feed_unavailable', articles:[]});}
}
