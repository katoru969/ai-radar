export const SOURCE_TYPES = ['official','youtube','note','github','zenn','qiita','bluesky','hackernews','mastodon'];
export const SOCIAL_TYPES = ['bluesky','hackernews','mastodon'];
export const SOURCE_LABELS = {official:'Official',youtube:'YouTube',note:'note',github:'GitHub',zenn:'Zenn',qiita:'Qiita',bluesky:'Bluesky',hackernews:'Hacker News',mastodon:'Mastodon'};
export const INTERESTS = ['AI技術全般', 'プログラミング', '仕事の効率化', '研究・論文', '教育', '画像・動画', 'ビジネス'];
export const TERM_NAMES = ['Agent', 'MCP', 'API', 'RAG', 'Context window', 'Embedding', 'Inference', 'Fine-tuning', 'Multimodal'];
export function normalizePreferences(saved = {}) {
  const old = saved?.sources || {};
  const migrations = {official:'RSS',youtube:'YouTube',note:'note',github:'GitHub'};
  const interests = Array.isArray(saved?.interests) ? saved.interests.map(value => ({'医学研究':'研究・論文','論文執筆':'研究・論文','ビジネス活用':'ビジネス'}[value] || value)).filter(value => INTERESTS.includes(value)) : ['AI技術全般','仕事の効率化'];
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
    const titleKey = `${article.sourceFamily || article.source}:${(article.originalTitle || article.title).normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '')}`;
    if (!keys.length || keys.some(url => urls.has(url)) || titles.has(titleKey)) return false;
    keys.forEach(url => urls.add(url)); titles.add(titleKey); return true;
  });
}
export function selectToday(articles, prefs, now = Date.now()) {
  const available = articles.filter(article => prefs.sources[article.sourceType] !== false && Number.isFinite(Date.parse(article.publishedAt)) && Date.parse(article.publishedAt) <= now + 5 * 60000);
  const latestReleases = new Map();
  for (const article of available.filter(item => item.sourceType === 'github')) {
    if (!latestReleases.has(article.source) || Date.parse(article.publishedAt) > Date.parse(latestReleases.get(article.source).publishedAt)) latestReleases.set(article.source,article);
  }
  const candidates = available.filter(article => article.sourceType !== 'github' || latestReleases.get(article.source) === article);
  const recent = candidates.filter(article => now - Date.parse(article.publishedAt) <= 7 * 24 * HOUR);
  const pool = recent.length >= 3 ? recent : candidates.filter(article => now - Date.parse(article.publishedAt) <= 30 * 24 * HOUR);
  const rank = article => article.importanceScore + (article.topics || []).filter(topic => prefs.interests.includes(topic)).length * 3 - Math.max(0,(now - Date.parse(article.publishedAt)) / (24 * HOUR)) * 1.5;
  const ranked = [...pool].sort((a, b) => rank(b) - rank(a) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const selected = [], families = new Map(), releases = new Set();
  const add = article => {
    const family = article.sourceFamily || article.source;
    if (selected.includes(article) || (families.get(family) || 0) >= 2 || (article.sourceType === 'github' && releases.has(article.source))) return;
    selected.push(article); families.set(family, (families.get(family) || 0) + 1);
    if (article.sourceType === 'github') releases.add(article.source);
  };
  for (const article of ranked.filter(item => item.sourceType === 'official')) {
    add(article);
    if (selected.length === 3) break;
  }
  for (const article of ranked) {
    if (selected.length === 5) break;
    add(article);
  }
  for (const article of ranked) {
    if (selected.length >= Math.min(3, ranked.length)) break;
    if (!selected.includes(article) && !(article.sourceType === 'github' && releases.has(article.source))) {
      selected.push(article);
      if (article.sourceType === 'github') releases.add(article.source);
    }
  }
  return selected;
}

export function limitFeedArticles(articles,limit = 100,now = Date.now()) {
  const newest = [...articles].sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const selected = new Map();
  const add = article => {if (selected.size < limit) selected.set(article.id,article);};
  selectToday(newest,{sources:{},interests:['AI技術全般']},now).forEach(add);
  // 投稿数の多い情報源だけで100件が埋まらないよう、各種類の最新5件を確保。
  for (const type of SOURCE_TYPES) newest.filter(article => article.sourceType === type).slice(0,5).forEach(add);
  newest.forEach(add);
  return [...selected.values()].sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
