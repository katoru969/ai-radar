import * as cheerio from 'cheerio';
import {compact,createArticle} from './articles.mjs';
import {plainText} from './text.mjs';
import {fetchJson} from './transport.mjs';
import {canonicalUrl} from '../shared.js';

const BLUESKY = 'https://public.api.bsky.app/xrpc/';
const HN = 'https://hacker-news.firebaseio.com/v0/';
const count = value => Math.max(0,Math.min(10000000,Math.floor(Number(value) || 0)));
const headline = text => compact(plainText(text).replace(/https?:\/\/\S+/g,'').trim(),150);

export function parseBluesky(data,source,now = Date.now()) {
  if (!Array.isArray(data?.feed)) throw new Error('invalid_bluesky_feed');
  return data.feed.slice(0,50).flatMap(entry => {
    const post = entry?.post,record = post?.record,author = post?.author;
    if (!record || typeof record.text !== 'string' || !author?.did || entry.reason || record.reply) return [];
    if (source.actor && ![author.did,author.handle].includes(source.actor)) return [];
    const prefix = `at://${author.did}/app.bsky.feed.post/`;
    if (typeof post.uri !== 'string' || !post.uri.startsWith(prefix)) return [];
    const rkey = post.uri.slice(prefix.length);
    if (!/^[a-z0-9]+$/i.test(rkey)) return [];
    const external = post.embed?.external || post.embed?.media?.external;
    const item = createArticle({
      title:external?.title || headline(record.text),
      description:plainText(`${record.text} ${external?.description || ''}`),
      url:`https://bsky.app/profile/${encodeURIComponent(author.did)}/post/${rkey}`,
      date:record.createdAt,thumbnail:external?.thumb || post.embed?.images?.[0]?.thumb || '',source
    },now);
    return item ? [{...item,linkedUrl:canonicalUrl(external?.uri),socialMetrics:{likes:count(post.likeCount),reposts:count(post.repostCount),replies:count(post.replyCount)}}] : [];
  });
}

export function parseMastodon(data,source,now = Date.now()) {
  if (!Array.isArray(data)) throw new Error('invalid_mastodon_feed');
  return data.slice(0,40).flatMap(post => {
    if (!post || post.reblog || post.in_reply_to_id || post.sensitive || post.visibility !== 'public' || typeof post.content !== 'string') return [];
    const $ = cheerio.load(post.content,{},false);
    const link = $('a:not(.mention):not(.hashtag)').toArray().map(element => canonicalUrl($(element).attr('href'))).find(url => url && new URL(url).origin !== new URL(source.instance).origin) || '';
    const item = createArticle({
      title:headline(post.content),description:plainText(post.content),date:post.created_at,
      url:post.url,thumbnail:post.media_attachments?.[0]?.preview_url || '',source
    },now);
    return item ? [{...item,linkedUrl:link,socialMetrics:{likes:count(post.favourites_count),reposts:count(post.reblogs_count),replies:count(post.replies_count)}}] : [];
  });
}

export function parseHackerNews(items,source,now = Date.now()) {
  if (!Array.isArray(items)) throw new Error('invalid_hacker_news_feed');
  return items.flatMap(post => {
    if (!post || post.deleted || post.dead || post.type !== 'story' || !Number.isInteger(post.id) || !Number.isFinite(post.time)) return [];
    const submittedAt = new Date(post.time * 1000);
    if (!Number.isFinite(submittedAt.getTime())) return [];
    const discussionUrl = `https://news.ycombinator.com/item?id=${post.id}`;
    const item = createArticle({title:plainText(post.title),description:plainText(post.text),url:post.url || discussionUrl,date:submittedAt.toISOString(),source},now);
    return item ? [{...item,discussionUrl,socialMetrics:{points:count(post.score),comments:count(post.descendants)}}] : [];
  });
}

async function mapSettled(values,parallel,callback) {
  let next = 0;
  const results = new Array(values.length);
  await Promise.all(Array.from({length:Math.min(parallel,values.length)},async () => {
    while (next < values.length) {
      const index = next++;
      try {results[index] = {status:'fulfilled',value:await callback(values[index])};}
      catch (reason) {results[index] = {status:'rejected',reason};}
    }
  }));
  return results;
}

export async function collectSocialSource(source,{now = Date.now(),fetchImpl = fetch,timeoutMs = 8000,signal} = {}) {
  const options = {fetchImpl,timeoutMs,signal};
  if (source.adapter === 'bluesky') {
    const url = new URL('app.bsky.feed.getAuthorFeed',BLUESKY);
    url.search = new URLSearchParams({actor:source.actor,limit:String(Math.min(50,source.limit || 30)),filter:'posts_no_replies'}).toString();
    return {articles:parseBluesky(await fetchJson(url.href,options),source,now)};
  }
  if (source.adapter === 'mastodon') {
    const instance = new URL(source.instance);
    if (instance.protocol !== 'https:') throw new Error('invalid_mastodon_instance');
    let accountId = source.accountId;
    if (!accountId) {
      const lookup = new URL('/api/v1/accounts/lookup',instance);
      lookup.searchParams.set('acct',source.account);
      accountId = (await fetchJson(lookup.href,options))?.id;
    }
    if (!/^\d+$/.test(String(accountId))) throw new Error('invalid_mastodon_account');
    const url = new URL(`/api/v1/accounts/${accountId}/statuses`,instance);
    url.search = new URLSearchParams({limit:'30',exclude_replies:'true',exclude_reblogs:'true'}).toString();
    return {articles:parseMastodon(await fetchJson(url.href,options),source,now)};
  }
  if (source.adapter === 'hackernews') {
    const ids = await fetchJson(`${HN}topstories.json`,options);
    if (!Array.isArray(ids)) throw new Error('invalid_hacker_news_feed');
    const selected = [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))].slice(0,Math.min(80,source.limit || 40));
    const results = await mapSettled(selected,6,id => fetchJson(`${HN}item/${id}.json`,options));
    const items = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const failures = results.length - items.length;
    if (selected.length && !items.length) throw new Error('hacker_news_items_failed');
    return {articles:parseHackerNews(items,source,now),partial:failures > 0};
  }
  throw new Error('unknown_social_adapter');
}
