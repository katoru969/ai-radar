import * as cheerio from 'cheerio';
import {embeddedJson} from './youtube.mjs';
import {fetchText} from './transport.mjs';
import {extractiveSummary,SUMMARY_VERSION} from './reader-summary.mjs';
import {sanitizeVideoSections,youtubeVideoId} from '../article-details.js';
import guides from '../content/video-guides.json' with {type:'json'};

const promo = /チャンネル登録|高評価|公式LINE|概要欄|プレゼント|無料(?:講座|勉強会|セミナー)|メンバーシップに加入/;
export function descriptionChapters(text,videoUrl) {
  const chapters = String(text || '').split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
    if (!match || /案内|お知らせ|オープニング|エンディング|まとめ|チャンネル/.test(match[2])) return [];
    const parts = match[1].split(':').map(Number);
    if (parts.slice(1).some(value => value >= 60)) return [];
    return [{title:match[2],startSeconds:parts.reduce((total,value) => total * 60 + value,0)}];
  });
  return sanitizeVideoSections(chapters,videoUrl,{chapters:true});
}
export function parseJapaneseCaptions(text) {
  if (!text?.trim()) return [];
  let rows;
  if (text.trim().startsWith('{')) {
    const json = JSON.parse(text);
    rows = (json.events || []).flatMap(event => event.segs ? [{startSeconds:Number(event.tStartMs) / 1000,text:event.segs.map(segment => segment.utf8 || '').join('')}] : []);
  } else {
    const $ = cheerio.load(text,{xml:true});
    rows = $('text,p[t]').map((_,element) => ({startSeconds:$(element).attr('start') !== undefined ? Number($(element).attr('start')) : Number($(element).attr('t')) / 1000,text:$(element).text()})).get();
  }
  return rows.filter(row => Number.isFinite(row.startSeconds) && row.startSeconds >= 0 && row.startSeconds <= 21600 && /[ぁ-んァ-ヶ一-龯]/u.test(row.text)).map(row => ({startSeconds:Math.floor(row.startSeconds),text:row.text.replace(/\[(?:音楽|拍手)\]|\s+/gu,'').slice(0,500)})).filter(row=>row.text).slice(0,5000);
}
export function transcriptSentences(segments) {
  const result = [];
  let buffer = '',start = 0;
  for (const segment of segments) {
    if (!buffer) start = segment.startSeconds;
    buffer += segment.text;
    while (true) {
      const end = buffer.search(/[。！？]/u);
      if (end < 0) break;
      const text = buffer.slice(0,end + 1); buffer = buffer.slice(end + 1);
      if (text.length >= 20 && text.length <= 230 && !promo.test(text) && !/^(?:こんにちは|こんばんは)/.test(text)) result.push({text,startSeconds:start});
      start = segment.startSeconds;
    }
    // 区切りが無い自動字幕を途中で切って手順として掲載しない。
    if (buffer.length > 700) buffer = '';
  }
  return result;
}
export function summarizeTranscript(segments,chapters,videoUrl) {
  const sentences = transcriptSentences(segments);
  const summary = extractiveSummary(sentences.map(sentence=>sentence.text).join('\n'),{video:true});
  if (!summary || summary.detailedSummary.length < 140) return null;
  const operation = /クリック|選択|入力|アップロード|添付|保存|追加|連携|設定|送信|作成.*(?:して|します)|開い/;
  const demos = chapters.filter(chapter=>/ハンズオン|実演|使い方|作り方|設定|導入|操作|活用/.test(chapter.title));
  const sections = (demos.length ? demos : [{title:'動画で紹介された操作',startSeconds:0}]).flatMap(chapter => {
    const end = chapters.find(next=>next.startSeconds > chapter.startSeconds)?.startSeconds ?? Infinity;
    const steps = sentences.filter(row=>row.startSeconds >= chapter.startSeconds && row.startSeconds < end && operation.test(row.text)).slice(0,3);
    return steps.length ? [{title:chapter.title,startSeconds:steps[0].startSeconds,steps:steps.map(step=>step.text),result:''}] : [];
  });
  return {...summary,videoSections:sanitizeVideoSections(sections,videoUrl)};
}
function captionUrl(value,videoId) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['www.youtube.com','youtube.com'].includes(url.hostname) && url.pathname === '/api/timedtext' && url.searchParams.get('v') === videoId;
  } catch {return false;}
}
export async function fetchVideoTranscript(videoUrl,{fetchImpl = fetch,timeoutMs = 8000,signal} = {}) {
  const id = youtubeVideoId(videoUrl);
  if (!id) return {segments:[],chapters:[],status:'unavailable'};
  const html = await fetchText(`https://www.youtube.com/watch?v=${id}`,{fetchImpl,timeoutMs,retries:0,maxBytes:4000000,signal,accept:'text/html'});
  const player = embeddedJson(html,'ytInitialPlayerResponse');
  if (player.videoDetails?.videoId !== id || player.playabilityStatus && player.playabilityStatus.status !== 'OK') return {segments:[],chapters:[],status:'unavailable'};
  const chapters = descriptionChapters(player.videoDetails.shortDescription,videoUrl);
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const track = tracks.filter(track=>track.languageCode === 'ja').sort((a,b)=>Number(a.kind === 'asr') - Number(b.kind === 'asr'))[0];
  if (!track || !captionUrl(track.baseUrl,id)) return {segments:[],chapters,status:'unavailable'};
  const url = new URL(track.baseUrl); url.searchParams.set('fmt','json3');
  const text = await fetchText(url.href,{fetchImpl,timeoutMs,signal,retries:0,maxBytes:1500000,validateUrl:value=>captionUrl(value,id),accept:'application/json,application/xml'});
  const segments = parseJapaneseCaptions(text);
  return {segments,chapters,status:segments.length ? 'available' : 'unavailable',captionKind:track.kind === 'asr' ? 'auto' : 'manual'};
}
export async function enrichVideoArticles(articles,{fetchImpl = fetch,timeoutMs = 8000,now = Date.now(),cache = new Map(),maxVideos = 10,signal,reviewedGuides = guides} = {}) {
  let next = 0;
  const candidates = articles.filter(article=>article.sourceType === 'youtube');
  const pending = [];
  for (const article of candidates) {
    const id = youtubeVideoId(article.url), saved = cache.get(article.id);
    Object.assign(article,{videoSummaryOrigin:'',captionKind:'',transcriptStatus:'unavailable',transcriptCheckedAt:null,videoSections:[],videoChapters:[],videoRequirements:[]});
    const reviewed = (Array.isArray(reviewedGuides) ? reviewedGuides : []).find(guide=>guide?.videoId === id && guide.sourceId === article.sourceId && guide.originalTitle === article.originalTitle && typeof guide.summary === 'string' && typeof guide.detailedSummary === 'string' && guide.detailedSummary.length >= 140 && guide.detailedSummary.length <= 650 && Array.isArray(guide.sections) && Number.isFinite(Date.parse(guide.checkedAt)) && Date.parse(guide.checkedAt) <= now + 300000);
    if (reviewed) {
      Object.assign(article,{summary:reviewed.summary.slice(0,150),detailedSummary:reviewed.detailedSummary.slice(0,650),videoSections:sanitizeVideoSections(reviewed.sections,article.url),videoRequirements:(Array.isArray(reviewed.requirements) ? reviewed.requirements : []).filter(value=>typeof value === 'string').slice(0,4).map(value=>value.slice(0,180)),videoChapters:[],summaryBasis:'video-transcript',summaryMode:'edited',summaryState:'ready',summaryVersion:SUMMARY_VERSION,videoSummaryOrigin:'reviewed',captionKind:'auto',transcriptStatus:'available',transcriptCheckedAt:reviewed.checkedAt});
      continue;
    }
    if (saved?.summaryVersion === SUMMARY_VERSION && saved.originalTitle === article.originalTitle && now - Date.parse(saved.transcriptCheckedAt) < 86400000) {
      for (const key of ['summary','detailedSummary','summaryBasis','summaryState','summaryMode','videoSections','videoChapters','videoRequirements','videoSummaryOrigin','captionKind','transcriptStatus','transcriptCheckedAt']) article[key] = saved[key];
      continue;
    }
    // 章名だけを内容の詳しいまとめとして表示しない。
    const prose = String(article.originalSummary || '').split('\n').filter(line=>/[。！？]/.test(line) && !/^\s*[①-⑳\d]/.test(line)).join('\n');
    const fallback = extractiveSummary(prose,{video:true});
    if (fallback) article.summary = fallback.summary;
    article.detailedSummary = fallback && fallback.detailedSummary.length >= 80 ? fallback.detailedSummary : '';
    article.summaryState = 'limited'; article.summaryBasis = /[ぁ-んァ-ヶ一-龯]/u.test(article.originalSummary || '') ? 'video-description' : 'unavailable'; article.summaryMode = 'extractive';
    if (id && /[ぁ-んァ-ヶ一-龯]/u.test(article.originalTitle)) pending.push(article);
  }
  const toFetch = pending.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,maxVideos);
  await Promise.all(Array.from({length:Math.min(2,toFetch.length)},async()=>{
    while (next < toFetch.length && !signal?.aborted) {
      const article = toFetch[next++];
      article.transcriptCheckedAt = new Date(now).toISOString();
      try {
        const transcript = await fetchVideoTranscript(article.url,{fetchImpl,timeoutMs,signal});
        article.videoChapters = transcript.chapters;
        const summary = summarizeTranscript(transcript.segments,transcript.chapters,article.url);
        if (summary) Object.assign(article,summary,{summaryBasis:'video-transcript',summaryMode:'extractive',transcriptStatus:'available',captionKind:transcript.captionKind,videoSummaryOrigin:'captions'});
      } catch { /* 字幕・動画単位の失敗を隔離。説明欄にない実演は補作しない。 */ }
    }
  }));
  return articles;
}
