import {createArticle} from './articles.mjs';
import {fetchText,safeFetchError} from './transport.mjs';
import {videoDescription} from './text.mjs';
import * as cheerio from 'cheerio';

// 公開ページに埋め込まれたJSONだけを読む。スクリプトは実行しない。
export function embeddedJson(html,name) {
  const marker = new RegExp(`(?:var\\s+)?${name}\\s*=\\s*|window\\["${name}"\\]\\s*=\\s*`,'g');
  let match;
  while ((match = marker.exec(html))) {
    const start = html.indexOf('{',marker.lastIndex);
    if (start < 0 || start - marker.lastIndex > 10) continue;
    let depth = 0, quoted = false, escaped = false;
    for (let index = start; index < html.length; index++) {
      const char = html[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try {return JSON.parse(html.slice(start,index + 1));} catch {break;}
      }
    }
  }
  throw new Error('youtube_page_changed');
}

export function channelVideoIds(html,limit = 10) {
  const data = embeddedJson(html,'ytInitialData'), ids = new Set();
  function visit(node,depth = 0) {
    if (!node || typeof node !== 'object' || depth > 60 || ids.size >= limit) return;
    const video = node.videoRenderer;
    if (video && !video.upcomingEventData && /^[A-Za-z0-9_-]{11}$/.test(video.videoId)) ids.add(video.videoId);
    const lockup = node.lockupViewModel;
    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && /^[A-Za-z0-9_-]{11}$/.test(lockup.contentId)) ids.add(lockup.contentId);
    for (const value of Object.values(node)) visit(value,depth + 1);
  }
  // チャンネルの動画タブ以外（おすすめ動画など）を走査しない。
  visit(data.contents?.twoColumnBrowseResultsRenderer?.tabs || data.contents?.singleColumnBrowseResultsRenderer?.tabs);
  if (!ids.size) throw new Error('youtube_page_changed');
  return [...ids];
}

export function parseWatchPage(html,videoId,source,now = Date.now()) {
  let player;
  try {player = embeddedJson(html,'ytInitialPlayerResponse');} catch {}
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const details = player?.videoDetails || {videoId:new URL(canonical || 'https://www.youtube.com/').searchParams.get('v'),channelId:$('meta[itemprop="channelId"]').attr('content'),title:$('meta[property="og:title"]').attr('content'),shortDescription:$('meta[property="og:description"]').attr('content') || '',thumbnail:{thumbnails:[{url:$('meta[property="og:image"]').attr('content')}]}};
  const meta = player?.microformat?.playerMicroformatRenderer;
  if (details.videoId !== videoId || details.channelId !== source.channelId || meta?.liveBroadcastDetails?.isLiveNow) return null;
  const date = meta?.publishDate || meta?.uploadDate || $('meta[itemprop="datePublished"]').attr('content') || $('meta[itemprop="uploadDate"]').attr('content');
  if (!date || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(date)) return null;
  return createArticle({title:details.title,date,datePrecision:date.includes('T') ? 'datetime' : 'day',url:`https://www.youtube.com/watch?v=${videoId}`,description:videoDescription(details.shortDescription || ''),thumbnail:details.thumbnail?.thumbnails?.at(-1)?.url || '',source},now);
}

export async function collectYouTubeSource(source,{parseFeed,fetchImpl = fetch,timeoutMs = 12000,signal,now = Date.now()} = {}) {
  let rssError;
  const alternateFeed = source.url.replace('https://www.youtube.com/','https://youtube.com/');
  for (const [index,url] of [...new Set([source.url,alternateFeed])].entries()) {
    try {
      const xml = await fetchText(url,{fetchImpl,timeoutMs:Math.min(timeoutMs,10000),signal,retries:index === 0 ? 2 : 1,retryStatuses:[404,429,500,502,503,504]});
      const articles = parseFeed(xml,source,now);
      if (!articles.length) throw new Error('not_a_feed');
      return {articles,retrievalMethod:'youtube-rss',...(rssError ? {recoveryReason:rssError} : {})};
    } catch (error) {rssError = safeFetchError(error);}
  }
  const channelUrl = source.channelUrl || `https://www.youtube.com/channel/${source.channelId}/videos`;
  const html = await fetchText(channelUrl,{fetchImpl,timeoutMs,signal,retries:1,maxBytes:4000000,accept:'text/html'});
  const ids = channelVideoIds(html,10), articles = [];
  let failed = 0, next = 0;
  const failures = {};
  const recordFailure = reason => {failed++; failures[reason] = (failures[reason] || 0) + 1;};
  await Promise.all(Array.from({length:Math.min(4,ids.length)},async () => {
    while (next < ids.length && !signal?.aborted) {
      const id = ids[next++];
      try {
        const page = await fetchText(`https://www.youtube.com/watch?v=${id}`,{fetchImpl,timeoutMs,signal,retries:0,maxBytes:4000000,accept:'text/html'});
        const article = parseWatchPage(page,id,source,now);
        if (article) articles.push(article); else {
          let reason = 'metadata_missing';
          try {
            const player = embeddedJson(page,'ytInitialPlayerResponse');
            reason = !player.videoDetails ? 'video_details_missing' : player.videoDetails.channelId !== source.channelId ? 'channel_mismatch' : !player.microformat?.playerMicroformatRenderer?.publishDate && !player.microformat?.playerMicroformatRenderer?.uploadDate ? 'date_missing' : 'invalid_date';
          } catch {reason = 'player_missing';}
          recordFailure(reason);
        }
      } catch (error) {recordFailure(safeFetchError(error));}
    }
  }));
  if (!articles.length) {const error = new Error('youtube_metadata_missing'); error.failures = failures; error.rssError = rssError; throw error;}
  return {articles:articles.sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),partial:failed > 0,retrievalMethod:'youtube-page',recoveryReason:rssError,failures};
}
