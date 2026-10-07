import * as cheerio from 'cheerio';
import {compact} from './articles.mjs';

export function plainText(input,{preserveLines = false} = {}) {
  const $ = cheerio.load(String(input || ''),{},false);
  $('script,style').remove();
  $('br,p,div,li,h1,h2,h3').after(preserveLines ? '\n' : ' ');
  const text = $.root().text();
  return preserveLines ? text.split(/\r?\n/u).map(line => compact(line,1800)).filter(Boolean).join('\n').slice(0,7000) : compact(text,5000);
}

export function videoDescription(input) {
  const text = plainText(input,{preserveLines:true}).split(/おすすめ動画|オススメ動画|関連動画|発信メディア一覧|プロフィール|完全無料[｜|].*コミュニティ|このチャンネルでは/u)[0];
  const result = [];
  let promotion = false;
  for (const line of text.split('\n')) {
    if (/目次|チャプター|タイムスタンプ/u.test(line)) {promotion = false; continue;}
    if (/^\d{1,2}:\d{2}(?::\d{2})?\s/u.test(line)) promotion = false;
    if (/公式LINE|公式Line|LINE登録|セミナー|講座|申し込み|メンバー|著書|プレゼント|無料相談|お仕事|タイアップ|登録はこちら|フォロー/u.test(line)) {promotion = true; continue;}
    if (promotion || /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]+|チャンネル登録|高評価|いいね|動画をご覧いただきありがとう/u.test(line)) continue;
    const clean = line.replace(/^(?:▼\s*|\d{1,2}:\d{2}(?::\d{2})?\s*)/u,'');
    if (clean.length >= 8) result.push(clean);
  }
  return result.join('\n');
}
