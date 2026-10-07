import * as cheerio from 'cheerio';
import {compact,isJapanese} from './articles.mjs';
import {fetchText} from './transport.mjs';
import {readerFit,selectToday} from '../shared.js';

const BODY_HOSTS = new Set(['openai.com','www.openai.com','anthropic.com','www.anthropic.com','blog.google','note.com','zenn.dev','qiita.com']);
const SUMMARY_VERSION = 4;
export function allowedBodyUrl(value) {
  try {const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && BODY_HOSTS.has(url.hostname);} catch {return false;}
}
const japaneseText = text => (text.match(/[ぁ-んァ-ヶ一-龯]/gu) || []).length >= Math.max(25,text.length * .15);
const promotion = /チャンネル登録|高評価|概要欄|LINE登録|公式LINE|無料(?:セミナー|講座|プレゼント|相談)|メルマガ|アフィリエイト|スポンサー|提供[:：]|本記事は.*PR|クリック.*(?:登録|申し込)|著者をフォロー|続きをみる|この記事が気に入ったら|目次はこちら/;

export function extractJapaneseBody(html,url) {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,header,footer,aside,form,button,[hidden],[aria-hidden="true"],.related-posts,.related-articles,[class*="share-button"],[class*="newsletter"],[class*="cookie-banner"]').remove();
  const selectors = {
    'note.com':['.note-common-styles__textnote-body','.p-article__body','[data-testid="article-body"]','article','main'],
    'zenn.dev':['.znc','article','main'],
    'qiita.com':['[itemprop="articleBody"]','.it-MdContent','article','main'],
    'blog.google':['.blog-post__body','.article-body','article','main']
  }[new URL(url).hostname] || ['[class*="article-body"]','article','main'];
  let paragraphs = [];
  for (const selector of selectors) {
    const root = $(selector).first();
    if (!root.length) continue;
    const lines = root.find('p,li,h2,h3').map((_,element) => {
      if ($(element).parents('li').length || $(element).find('p,li').length) return null;
      return compact($(element).text(),1600);
    }).get().filter(line => line.length >= 12 && !promotion.test(line));
    if (japaneseText(lines.join(' '))) {paragraphs = lines; break;}
  }
  const body = [...new Set(paragraphs)].join('\n').slice(0,12000);
  if (!japaneseText(body) || body.length < 100) return null;
  const heading = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || '';
  const cleanHeading = heading.replace(/\s*[|｜]\s*(?:Zenn|Qiita|note|OpenAI|Anthropic|Google)(?:\s.*)?$/iu,'');
  return {body,title:isJapanese(cleanHeading) && !/^(はじめに|概要|まとめ|序文)$/u.test(cleanHeading.trim()) ? compact(cleanHeading,100) : '',url};
}

export function japaneseArticleUrl(value) {
  if (!allowedBodyUrl(value)) return null;
  const url = new URL(value);
  if (['openai.com','www.openai.com'].includes(url.hostname) && /^\/(?:index|news)\//.test(url.pathname)) {
    url.pathname = `/ja-JP${url.pathname.replace(/^\/news\//,'/index/')}`;
    return url.href;
  }
  if (['anthropic.com','www.anthropic.com'].includes(url.hostname) && url.pathname.startsWith('/news/')) {
    url.pathname = `/ja${url.pathname}`;
    return url.href;
  }
  return null;
}

function sentencesOf(text,video = false) {
  return String(text || '').replace(/https?:\/\/\S+/g,'').split(/(?<=[。！？])\s*|\n+/u).map(value => compact(value,1500)).filter(value => value.length >= (video ? 12 : 22) && (video ? isJapanese(value) : japaneseText(value)) && !promotion.test(value) && !/^(?:こんにちは|はじめまして|おはよう|こんばんは|いつもご視聴|ご覧いただき|動画をご覧)/u.test(value) && !/お悩み|耳にします|追われていませんか|今回は.*解説します|次の\d+段階です/u.test(value)).map(value => /[。！？]$/.test(value) ? value : `${value}。`);
}
// 原文の文を選んで順序を保つ抽出方式。モデル・料金・利用条件を補作しない。
export function extractiveSummary(text,{video = false} = {}) {
  const sentences = [...new Set(sentencesOf(text,video))];
  if (!sentences.length) return null;
  const weighted = sentences.map((text,index) => ({text,index,score:(index < 3 ? 2 : 0) + (/chatgpt|claude|gemini|notebooklm|AI|新機能|使い方|設定|でき|対応|追加|無料|料金|プラン|利用|提供|手順|注意|制限|日本/iu.test(text) ? 3 : 0) + (/円|ドル|対象|有料|注意|制限|順次|上限|日本/u.test(text) ? 3 : 0) + (/料金|対象プラン|利用できます|提供.*開始/u.test(text) ? 2 : 0)}));
  const pick = (maxSentences,maxChars,overview = false) => {
    const chosen = [];
    let chars = 0;
    if (overview) {
      const main = weighted.find(item => item.text.length <= maxChars && /発表|公開|新機能|追加|解説|でき|可能|対応|紹介|使い方/u.test(item.text));
      if (main) {chosen.push(main); chars = main.text.length;}
    }
    for (const item of [...weighted].sort((a,b) => b.score - a.score || a.index - b.index)) {
      if (chosen.length >= maxSentences) break;
      if (chosen.includes(item)) continue;
      if (chars + item.text.length <= maxChars) {chosen.push(item); chars += item.text.length;}
    }
    if (!chosen.length) return compact(sentences[0],maxChars);
    return chosen.sort((a,b) => a.index - b.index).map(item => item.text).join('');
  };
  // 一覧はiPhoneでおよそ3行。詳細は原文がある範囲で約300〜550字。
  const summary = pick(2,150,true), detailedSummary = pick(video ? 5 : 7,550);
  return {summary,detailedSummary,summaryState:detailedSummary.length >= 250 ? 'ready' : 'limited',summaryMode:'extractive'};
}

export async function enrichReaderArticles(articles,{fetchImpl = fetch,timeoutMs = 8000,now = Date.now(),cache = new Map(),maxBodies = 40,signal} = {}) {
  const result = articles.map(article => {
    const video = article.sourceType === 'youtube';
    const extracted = extractiveSummary(article.originalSummary,{video});
    return {...article,...(extracted || {}),detailedSummary:extracted?.detailedSummary || '',summaryBasis:extracted ? video ? 'video-description' : 'feed' : 'unavailable',summaryState:extracted?.summaryState || 'unavailable',summaryVersion:SUMMARY_VERSION,bodyUrl:'',bodyCheckedAt:null};
  });
  // Today候補を先に読み、残りも新しい日本語の解説から順に取得する。
  const priorityIds = new Set(selectToday(result,{sources:{},interests:['新機能・料金','使い方・設定']},now).map(article => article.id));
  const candidates = result.filter(article => article.sourceType !== 'youtube' && allowedBodyUrl(article.url) && readerFit(article).eligible).sort((a,b) => Number(priorityIds.has(b.id)) - Number(priorityIds.has(a.id)) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0,maxBodies);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},async () => {
    while (next < candidates.length && !signal?.aborted) {
      const article = candidates[next++], saved = cache.get(article.id);
      if (saved?.summaryVersion === SUMMARY_VERSION && saved.summaryBasis === 'article' && saved.originalTitle === article.originalTitle && saved.originalSummary === article.originalSummary && now - Date.parse(saved.bodyCheckedAt) < 86400000) {
        for (const key of ['title','summary','detailedSummary','summaryBasis','summaryState','summaryMode','bodyUrl','bodyCheckedAt']) article[key] = saved[key];
        continue;
      }
      const japaneseUrl = japaneseArticleUrl(article.url);
      const urls = !isJapanese(article.originalTitle) && japaneseUrl ? [japaneseUrl,article.url] : [article.url];
      for (const url of urls) {
        try {
          const html = await fetchText(url,{fetchImpl,timeoutMs,retries:0,signal,validateUrl:allowedBodyUrl,accept:'text/html'});
          const body = extractJapaneseBody(html,url);
          if (!body) continue;
          const extracted = extractiveSummary(body.body);
          if (!extracted) continue;
          Object.assign(article,extracted,{summaryBasis:'article',bodyUrl:url,bodyCheckedAt:new Date(now).toISOString(),...(body.title ? {title:body.title} : {})});
          break;
        } catch { /* 本文取得の失敗はフィードや他の記事へ波及させない。 */ }
      }
    }
  }));
  return result;
}
