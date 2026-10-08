// 記事の理解状況とブックマークは端末内だけに保存する。
export const READING_KEY = 'ai-radar-reading-v1';

const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 150;
export function normalizeReadingState(saved, normalizeArticle = article => article) {
  const understoodIds = [...new Set((Array.isArray(saved?.understoodIds) ? saved.understoodIds : []).filter(validId))];
  const bookmarks = new Map();
  for (const entry of Array.isArray(saved?.bookmarks) ? saved.bookmarks : []) {
    const article = normalizeArticle(entry?.article);
    if (!article || !validId(article.id)) continue;
    bookmarks.set(article.id,{article,savedAt:Number.isFinite(Date.parse(entry.savedAt)) ? entry.savedAt : null});
  }
  return {version:1,understoodIds,bookmarks:[...bookmarks.values()]};
}

export function setArticleUnderstood(state,id,understood = true) {
  if (!validId(id)) return state;
  const ids = new Set(state.understoodIds);
  if (understood) ids.add(id); else ids.delete(id);
  return {...state,understoodIds:[...ids]};
}

export function toggleArticleBookmark(state,article,now = Date.now()) {
  if (!article || !validId(article.id)) return state;
  const exists = state.bookmarks.some(entry => entry.article.id === article.id);
  return {...state,bookmarks:exists ? state.bookmarks.filter(entry => entry.article.id !== article.id) : [{article:structuredClone(article),savedAt:new Date(now).toISOString()},...state.bookmarks]};
}

export function findReadingArticle(id,articles,state) {
  return articles.find(article => article.id === id) || state.bookmarks.find(entry => entry.article.id === id)?.article;
}

export function readingCollection(articles,state,filter = 'all') {
  if (filter === 'bookmarked') return state.bookmarks.map(entry => findReadingArticle(entry.article.id,articles,state));
  if (filter === 'understood') {
    const combined = new Map([...state.bookmarks.map(entry => entry.article),...articles].map(article => [article.id,article]));
    const understood = new Set(state.understoodIds);
    return [...combined.values()].filter(article => understood.has(article.id));
  }
  return articles;
}
