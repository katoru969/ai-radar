import * as cheerio from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createArticle } from './articles.mjs';
import { safeUrl } from '../shared.js';
import {plainText,videoDescription} from './text.mjs';
import {fetchText,safeFetchError} from './transport.mjs';
import {collectYouTubeSource} from './youtube.mjs';
import {collectSocialSource} from './socials.mjs';
export {plainText} from './text.mjs';
export {fetchText} from './transport.mjs';

const parser = new XMLParser({ignoreAttributes:false, attributeNamePrefix:'@_', textNodeName:'#text', parseTagValue:false, trimValues:true, processEntities:true, htmlEntities:true});
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const value = item => typeof item === 'string' ? item : item?.['#text'] || '';
function imageUrl(node, description) {
  const media = list(node['media:thumbnail'])[0] || list(node['media:content'])[0] || list(node['media:group']?.['media:thumbnail'])[0];
  if (safeUrl(media?.['@_url'])) return media['@_url'];
  const enclosure = list(node.enclosure).find(item => item?.['@_type']?.startsWith('image/'));
  if (enclosure) return enclosure['@_url'];
  return cheerio.load(description || '')('img').first().attr('src') || '';
}
export function parseFeed(xml, source, now = Date.now()) {
  if (xml.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('unsafe_xml');
  if (XMLValidator.validate(xml) !== true) throw new Error('invalid_xml');
  const doc = parser.parse(xml);
  if (!doc.rss?.channel && !doc.feed && !doc['rdf:RDF']) throw new Error('not_a_feed');
  const nodes = doc.feed ? list(doc.feed.entry) : list(doc.rss?.channel?.item || doc['rdf:RDF']?.item);
  return nodes.slice(0, 80).map(node => {
    const description = value(node.description) || value(node.summary) || value(node.content) || value(node['content:encoded']) || value(node['media:group']?.['media:description']);
    const links = list(node.link);
    const alternate = links.find(link => typeof link === 'object' && (!link['@_rel'] || link['@_rel'] === 'alternate') && (!link['@_type'] || link['@_type'] === 'text/html'));
    const link = alternate?.['@_href'] || links.find(link => typeof link === 'string') || '';
    return createArticle({title:plainText(value(node.title)), url:link, date:value(node.pubDate) || value(node.published) || value(node.updated) || value(node['dc:date']), description:source.sourceType === 'youtube' ? videoDescription(description) : plainText(description), thumbnail:imageUrl(node, description), source}, now);
  }).filter(Boolean);
}
export function parseAnthropic(html, source, now = Date.now()) {
  const $ = cheerio.load(html), articles = [];
  $('a[href^="/news/"]').each((_, element) => {
    const anchor = $(element), time = anchor.find('time').first();
    const title = anchor.find('[class*="__title"],h2,h3').first().text().trim();
    const date = time.attr('datetime') || time.text().trim();
    if (!title || !date) return;
    const article = createArticle({title, date:/^\w{3} \d{1,2}, \d{4}$/.test(date) ? `${date} 00:00:00 GMT` : date, datePrecision:time.attr('datetime')?.includes('T') ? 'datetime' : 'day', url:new URL(anchor.attr('href'), source.url).href, source}, now);
    if (article) articles.push(article);
  });
  if (!articles.length) throw new Error('anthropic_page_changed');
  return articles.slice(0, 25);
}
export function configuredSources(config) {
  return [
    ...(config.rss || []).map(source => ({...source, sourceType:source.sourceType || 'official', adapter:'feed'})),
    ...(config.anthropic || []).map(source => ({...source, sourceType:'official', adapter:'anthropic'})),
    ...(config.github || []).map(source => ({...source, sourceType:'github', adapter:'feed'})),
    ...(config.note || []).map(source => ({...source, sourceType:'note', adapter:'feed', url:`https://note.com/${encodeURIComponent(source.handle)}/rss`})),
    ...(config.youtube || []).map(source => ({...source, sourceType:'youtube', adapter:'youtube', url:`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(source.channelId)}`})),
    ...(config.zenn || []).map(source => ({...source,sourceType:'zenn',adapter:'feed',url:source.url || `https://zenn.dev/${source.topic ? `topics/${encodeURIComponent(source.topic)}` : encodeURIComponent(source.handle)}/feed`})),
    ...(config.qiita || []).map(source => ({...source,sourceType:'qiita',adapter:'feed',url:source.url || `https://qiita.com/${source.tag ? `tags/${encodeURIComponent(source.tag)}` : encodeURIComponent(source.handle)}/feed`})),
    ...(config.bluesky || []).map(source => ({...source,sourceType:'bluesky',adapter:'bluesky'})),
    ...(config.hackernews || []).map(source => ({...source,sourceType:'hackernews',adapter:'hackernews'})),
    ...(config.mastodon || []).map(source => ({...source,sourceType:'mastodon',adapter:'mastodon'}))
  ].filter(source => source.enabled !== false);
}
export async function collectSources(config, {fetchImpl = fetch, timeoutMs = 8000, now = Date.now(), previous = new Map(), signal:collectionSignal} = {}) {
  const sources = configuredSources(config);
  const results = await Promise.allSettled(sources.map(async source => {
    const timeout = AbortSignal.timeout(source.adapter === 'youtube' ? Math.max(timeoutMs,45000) : timeoutMs);
    const signal = collectionSignal ? AbortSignal.any([collectionSignal,timeout]) : timeout;
    if (source.adapter === 'youtube') return {source,...await collectYouTubeSource(source,{parseFeed,now,fetchImpl,timeoutMs,signal})};
    if (!['feed','anthropic'].includes(source.adapter)) return {source,...await collectSocialSource(source,{now,fetchImpl,timeoutMs,signal})};
    const text = await fetchText(source.url,{fetchImpl,timeoutMs,signal});
    return {source,articles:source.adapter === 'anthropic' ? parseAnthropic(text, source, now) : parseFeed(text, source, now)};
  }));
  const articles = [], statuses = [];
  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === 'fulfilled') {
      articles.push(...result.value.articles);
      previous.set(source.id, {articles:result.value.articles, fetchedAt:new Date(now).toISOString()});
      statuses.push({id:source.id, name:source.name, sourceType:source.sourceType, status:result.value.partial ? 'partial' : result.value.articles.length ? 'ok' : 'empty', count:result.value.articles.length, fetchedAt:new Date(now).toISOString(),retrievalMethod:result.value.retrievalMethod || source.adapter,...(result.value.recoveryReason ? {recoveryReason:result.value.recoveryReason} : {}),...(result.value.failures ? {failures:result.value.failures} : {})});
    } else {
      const cached = previous.get(source.id), usable = cached && now - Date.parse(cached.fetchedAt) < 86400000;
      if (usable) articles.push(...cached.articles);
      statuses.push({id:source.id, name:source.name, sourceType:source.sourceType, status:usable ? 'cached' : 'error', count:usable ? cached.articles.length : 0, fetchedAt:usable ? cached.fetchedAt : null, error:safeFetchError(result.reason),...(result.reason?.failures ? {failures:result.reason.failures} : {}),...(result.reason?.rssError ? {feedError:result.reason.rssError} : {})});
    }
  });
  return {articles, sources:statuses, previous};
}
