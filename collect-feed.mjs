import {collectSources} from './feeds.mjs';
import {summarizeArticles} from './summarizer.mjs';
import {deduplicateArticles,limitFeedArticles} from '../shared.js';

export async function collectFeed(config,{previous = new Map(),now = Date.now(),fetchImpl = fetch,timeoutMs = 8000,env = {SUMMARIZER:'rules'}} = {}) {
  const collected = await collectSources(config,{previous,now,fetchImpl,timeoutMs});
  const unique = limitFeedArticles(deduplicateArticles(collected.articles),100,now);
  const hasFreshSource = collected.sources.some(source => ['ok','empty','partial'].includes(source.status));
  const enriched = hasFreshSource ? await summarizeArticles(unique,{env,fetchImpl,now}) : {articles:unique,mode:'rules',state:'fallback'};
  const generatedAt = hasFreshSource ? new Date(now).toISOString() : collected.sources.filter(source => source.fetchedAt).map(source => source.fetchedAt).sort().at(-1) || null;
  return {
    schemaVersion:2,generatedAt,checkedAt:new Date(now).toISOString(),refreshAfter:15 * 60000,
    articles:enriched.articles,sources:collected.sources,
    summary:{mode:enriched.mode,state:enriched.state},
    degraded:collected.sources.some(source => ['error','cached','partial'].includes(source.status))
  };
}
