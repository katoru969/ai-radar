import {collectSources} from './feeds.mjs';
import {summarizeArticles} from './summarizer.mjs';
import {deduplicateArticles,limitFeedArticles,readerFit} from '../shared.js';
import {enrichReaderArticles} from './reader-summary.mjs';

export async function collectFeed(config,{previous = new Map(),now = Date.now(),fetchImpl = fetch,timeoutMs = 8000,totalTimeoutMs = 120000,env = {SUMMARIZER:'rules'}} = {}) {
  const signal = AbortSignal.timeout(totalTimeoutMs);
  const summaryCache = new Map([...previous.values()].flatMap(value => value.articles || []).map(article => [article.id,article]));
  const collected = await collectSources(config,{previous,now,fetchImpl,timeoutMs,signal});
  const useful = deduplicateArticles(collected.articles).filter(article => readerFit(article).eligible);
  const unique = limitFeedArticles(useful,100,now);
  const readable = await enrichReaderArticles(unique,{fetchImpl,timeoutMs:Math.min(timeoutMs,8000),now,cache:summaryCache,signal});
  const readableById = new Map(readable.map(article => [article.id,article]));
  for (const entry of previous.values()) entry.articles = entry.articles.map(article => readableById.get(article.id) || article);
  const hasFreshSource = collected.sources.some(source => ['ok','empty','partial'].includes(source.status));
  const readerArticles = readable.filter(article => readerFit(article).eligible);
  const enriched = hasFreshSource ? await summarizeArticles(readerArticles,{env,fetchImpl,now}) : {articles:readerArticles,mode:'rules',state:'fallback'};
  const generatedAt = hasFreshSource ? new Date(now).toISOString() : collected.sources.filter(source => source.fetchedAt).map(source => source.fetchedAt).sort().at(-1) || null;
  return {
    schemaVersion:3,generatedAt,checkedAt:new Date(now).toISOString(),refreshAfter:15 * 60000,readerProfile:'consumer',
    articles:enriched.articles,sources:collected.sources,
    summary:{mode:enriched.mode === 'rules' ? 'extractive' : enriched.mode,state:enriched.state === 'off' ? 'ok' : enriched.state},
    degraded:collected.sources.some(source => ['error','cached','partial'].includes(source.status))
  };
}
