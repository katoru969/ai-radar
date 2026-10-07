export const SOURCE_TYPES = ['official','youtube','note','github','zenn','qiita','bluesky','hackernews','mastodon'];
export const SOCIAL_TYPES = ['bluesky','hackernews','mastodon'];
export const SOURCE_LABELS = {official:'Official',youtube:'YouTube',note:'note',github:'GitHub',zenn:'Zenn',qiita:'Qiita',bluesky:'Bluesky',hackernews:'Hacker News',mastodon:'Mastodon'};
export const INTERESTS = ['新機能・料金', '使い方・設定', '仕事の効率化', '調べもの・学習', '画像・動画'];
export const TERM_NAMES = ['Agent', 'MCP', 'API', 'RAG', 'Context window', 'Embedding', 'Inference', 'Fine-tuning', 'Multimodal'];
export function normalizePreferences(saved = {}) {
  const old = saved?.sources || {};
  const migrations = {official:'RSS',youtube:'YouTube',note:'note',github:'GitHub'};
  const migrationsByInterest = {'AI技術全般':'新機能・料金','プログラミング':'使い方・設定','医学研究':'調べもの・学習','論文執筆':'調べもの・学習','研究・論文':'調べもの・学習','教育':'調べもの・学習','ビジネス活用':'仕事の効率化','ビジネス':'仕事の効率化'};
  const interests = Array.isArray(saved?.interests) ? saved.interests.map(value => migrationsByInterest[value] || value).filter(value => INTERESTS.includes(value)) : ['新機能・料金','使い方・設定'];
  return {
    interests:[...new Set(interests)],
    sources:Object.fromEntries(SOURCE_TYPES.map(type => [type,typeof old[type] === 'boolean' ? old[type] : typeof old[migrations[type]] === 'boolean' ? old[migrations[type]] : true])),
    notifications:{important:saved?.notifications?.important === true,digest:saved?.notifications?.digest === true},
    understood:Array.isArray(saved?.understood) ? [...new Set(saved.understood.filter(term => TERM_NAMES.includes(term)))] : []
  };
}
export const HOUR = 3600000;
export const safeUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};
export const gradeFor = score => score >= 85 ? 'A' : score >= 72 ? 'B' : 'C';
export const GRADE_LABELS = {A:'まずチェック',B:'試す候補',C:'参考情報'};

// 判定は原題を中心に行う。動画説明欄の宣伝にChatGPTがあるだけでは採用しない。
export function readerFit(article) {
  const title = String(article.originalTitle || article.title || '').normalize('NFKC');
  const excerpt = `${String(article.originalSummary || '').slice(0,600)} ${String(article.detailedSummary || '').slice(0,600)} ${String(article.summary || '').slice(0,300)}`;
  const primary = /chatgpt|claude|gemini/i.test(title);
  const product = /chatgpt|claude|gemini|notebook\s?lm|sora|canva|copilot|perplexity|midjourney|gpt[- ]?\d/i.test(title);
  const howTo = /how (?:to|i)|guide|tips|tutorial|prompt|使い方|活用|手順|設定|コツ|入門|初心者|プロンプト|試して|使って|やり方|できること|使える|方法|比較|選び方|時短|徹底解説/i.test(title);
  const simpleSetup = /no[- ]?code|without cod|ノーコード|コピペ|初心者|コード不要|簡単な設定/i.test(title);
  const engineering = /\bapi\b|\bsdk\b|\bcli\b|python|typescript|javascript|docker|kubernetes|langchain|llamaindex|embedding|fine[- ]?tun|\brag\b|mlops|benchmark|\be2e\b|gemini-\d|移行ガイド|隠しテスト|ユニットテスト|開発工程|ベンチマーク|実装|アーキテクチャ|ライブラリ|ファインチューニング|埋め込み|コーディング|ソースコード|開発者|エンジニア|claude code|codex/i.test(title);
  if (engineering && !simpleSetup) return {eligible:false,category:'',reason:'開発・実装向け',priority:0};
  const developerAudience = /API.{0,100}(?:組み込|バッチ|エンドポイント|移行|アプリ開発)|(?:SDK|pip install|npm install|HTTPリクエスト|APIキー.{0,50}コード|百万トークン|million tokens|入力単価|キャッシュ読み取り価格|トークン単価)/i.test(excerpt);
  if (developerAudience && !simpleSetup) return {eligible:false,category:'',reason:'本文が開発者向け',priority:0};
  const technicalMentions = excerpt.match(/\bapi\b|\bsdk\b|\bcli\b|\bcodex\b|claude code|benchmark|\be2e\b|コーディング|実装|ベンチマーク|エンドポイント|開発工程/gi) || [];
  if (technicalMentions.length >= 3 && !simpleSetup) return {eligible:false,category:'',reason:'本文の中心が開発・性能検証',priority:0};
  if (/partner|verification program|funding|acquisit|enterprise|quant research|life sciences|training.*engineers|sponsor|keynote|summit|conference|case study|partnership|customer stor|\bads\b|advertis|\bscales?\b.*(?:claude|chatgpt)|^how (?!to\b).+ with (?:chatgpt|claude)|frees up.*grow with|completes?.*faster with|turns legal context|提携|資金調達|買収|企業向け|法人向け|導入事例|広告出稿|登壇|イベント開催|受賞|採用情報/i.test(title)) return {eligible:false,category:'',reason:'個人の利用に直結しない発表',priority:0};
  const pricing = /pric|pricing|subscription|\bplans?\b|\bfree\b|料金|価格|値上げ|値下げ|無料|有料|プラン|上限|制限/i.test(title);
  const feature = /introduc|meet |launch|release|available|roll.?out|update|\bnew\b|新機能|新モデル|新しい|追加|登場|公開|アップデート|リリース|対応|提供開始|進化/i.test(title);
  const aiUse = /\bai\b|生成AI|人工知能|エージェント|mcp/i.test(title);
  // タイトルがモデル名だけの発表は、一般利用できる製品への言及も確認する。
  const appAnnouncement = !product && /gpt[- ]?\d|opus|sonnet|haiku/i.test(title) && /chatgpt|claude|gemini.*app/i.test(excerpt) && feature;
  const eligible = product || appAnnouncement || (aiUse && howTo);
  const category = pricing && (product || aiUse) ? '料金・利用条件' : howTo ? '使い方・設定' : feature || appAnnouncement ? '新機能' : '活用情報';
  return {eligible,category:eligible ? category : '',reason:eligible ? primary ? '使っているAIの変更・活用' : '個人で試せるAIの活用' : '具体的な利用方法が確認できない',priority:eligible ? (primary ? 12 : 5) + (pricing ? 8 : feature ? 6 : howTo ? 5 : 0) : 0};
}
export function canonicalUrl(value) {
  const clean = safeUrl(value);
  if (!clean) return '';
  const url = new URL(clean);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(ref|source|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}
export function deduplicateArticles(articles) {
  const urls = new Set(), titles = new Set();
  // 共有リンクが同じときは、公式記事・元記事を優先します。
  const priority = article => article.sourceType === 'official' ? 0 : article.sourceType === 'github' ? 1 : SOCIAL_TYPES.includes(article.sourceType) ? 3 : 2;
  return [...articles].sort((a,b) => priority(a) - priority(b)).filter(article => {
    const keys = [...new Set([canonicalUrl(article.url),canonicalUrl(article.linkedUrl)].filter(Boolean))];
    const title = (article.originalTitle || article.title).normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
    // Zenn・Qiitaへの同じ記事の転載も除外。短い汎用見出しは発信元で区別。
    const titleKey = title.length >= 24 ? title : `${article.sourceFamily || article.source}:${title}`;
    if (!keys.length || keys.some(url => urls.has(url)) || titles.has(titleKey)) return false;
    keys.forEach(url => urls.add(url)); titles.add(titleKey); return true;
  });
}
export function selectToday(articles, prefs, now = Date.now()) {
  const candidates = articles.filter(article => prefs.sources[article.sourceType] !== false && readerFit(article).eligible && Number.isFinite(Date.parse(article.publishedAt)) && Date.parse(article.publishedAt) <= now + 5 * 60000);
  const recent = candidates.filter(article => now - Date.parse(article.publishedAt) <= 7 * 24 * HOUR);
  const pool = recent.length >= 3 ? recent : candidates.filter(article => now - Date.parse(article.publishedAt) <= 30 * 24 * HOUR);
  const readable = pool.filter(article => !article.summaryBasis || article.summaryBasis !== 'unavailable');
  const readingPool = readable.length >= 3 ? readable : pool;
  const rank = article => article.importanceScore + readerFit(article).priority + (article.topics || []).filter(topic => prefs.interests.includes(topic)).length * 3 + (article.summaryBasis === 'article' ? 4 : 0) - Math.max(0,(now - Date.parse(article.publishedAt)) / (24 * HOUR)) * 2;
  const ranked = [...readingPool].sort((a, b) => rank(b) - rank(a) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const selected = [], families = new Map();
  const add = article => {
    const family = article.sourceFamily || article.source;
    if (selected.includes(article) || (families.get(family) || 0) >= 2) return;
    selected.push(article); families.set(family, (families.get(family) || 0) + 1);
  };
  for (const article of ranked) {
    if (selected.length === 5) break;
    add(article);
  }
  // 最近の有用な動画がある日は1枠を確保。古い動画で最新ニュースを押し出さない。
  const video = ranked.find(item => item.sourceType === 'youtube' && now - Date.parse(item.publishedAt) <= 7 * 24 * HOUR);
  if (video && !selected.some(item => item.sourceType === 'youtube')) {
    const family = video.sourceFamily || video.source;
    if ((families.get(family) || 0) < 2) {
      if (selected.length === 5) {const removed = selected.pop(); const removedFamily = removed.sourceFamily || removed.source; families.set(removedFamily,families.get(removedFamily) - 1);}
      add(video);
    }
  }
  for (const article of ranked) {
    if (selected.length >= Math.min(3, ranked.length)) break;
    if (!selected.includes(article)) {
      selected.push(article);
    }
  }
  return selected;
}

export function limitFeedArticles(articles,limit = 100,now = Date.now()) {
  const newest = [...articles].sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const selected = new Map();
  const add = article => {if (selected.size < limit) selected.set(article.id,article);};
  selectToday(newest,{sources:{},interests:['新機能・料金','使い方・設定']},now).forEach(add);
  // 投稿数の多い情報源だけで100件が埋まらないよう、各種類の最新5件を確保。
  for (const type of SOURCE_TYPES) newest.filter(article => article.sourceType === type).slice(0,5).forEach(add);
  newest.forEach(add);
  return [...selected.values()].sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
