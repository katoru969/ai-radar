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
  const text = plainText(input,{preserveLines:true});
  const result = [];
  const promo = /公式LINE|公式Line|LINE登録|申し込み|メンバーシップ|著書|新刊|出版記念|発売|プレゼント|無料相談|お仕事|タイアップ|登録はこちら|フォロー|スポンサード|Sponsored|\bPR\b|クーポン|専用リンク|事前登録|ワークショップ.{0,20}(?:登録|募集)|研修|コーチング|アンケート|アーカイブ|特典|図書カード|マイルが貯|PIVOTアプリ|ダウンロードはこちら|無料(?:講座|セミナー)|(?:記事|AI要約).{0,12}こちら|入会|スクール|採用情報|サービスサイトはこちら|編集でカット|カット・ぼか|義援金|寄付|応援する動画|応援する.*投稿|ご協力のほど|ご視聴ありがとう/iu;
  let promotion = false, profile = false;
  for (const line of text.split('\n')) {
    if (/目次|チャプター|タイムスタンプ/u.test(line)) {promotion = false; profile = false; continue;}
    const chapter = line.match(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s+(.+)/u);
    if (chapter) {
      promotion = false; profile = false;
      if (!promo.test(chapter[1]) && !/案内|告知|オープニング|エンディング/u.test(chapter[1])) result.push(line.trim());
      continue;
    }
    if (/おすすめ動画|オススメ動画|関連動画|発信メディア一覧|完全無料[｜|].*コミュニティ|このチャンネルでは/u.test(line)) break;
    if (/^(?:[■▼【＜].*)?(?:プロフィール|出演者|ゲスト)|^.{1,30}[｜|].*(?:エンジニア|起業家|議員|CEO|代表|教授|学者|研究員|Fellow|担当|編集長)/iu.test(line)) {profile = true; continue;}
    if (profile) continue;
    if (promo.test(line)) {promotion = true; continue;}
    if (/https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]+|チャンネル登録|高評価|いいね|動画をご覧いただきありがとう|^\s*#|^(?:写真|撮影|音楽)[：:]/u.test(line) || /^[━─―\-=_\s]+$/u.test(line)) continue;
    // 冒頭の告知の後に本動画の説明がある媒体も、内容の段落から再開する。
    if (promotion && /[。！？]/u.test(line) && /本動画|この動画|今回|今週|^\d{4}年.*(?:AIニュース|生成AI)|^(?:ChatGPT|Claude|Gemini|OpenAI|AIエージェント)(?:の|が|は|を|に|で|\s)/i.test(line)) promotion = false;
    if (promotion) continue;
    const clean = line.replace(/^▼\s*/u,'');
    if (clean.length >= 8) result.push(clean);
  }
  return result.join('\n');
}
