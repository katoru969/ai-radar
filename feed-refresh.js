// 更新の確認結果は、収集日時・記事の変更・保存分の利用を区別する。
export function feedRequestUrl(path,base,now = Date.now()) {
  const url = new URL(path,base);
  if (url.pathname.endsWith('/feed.json')) url.searchParams.set('_radar',String(now));
  return url;
}

export function validFeedPayload(data) {
  return Boolean(data && Array.isArray(data.articles) && Array.isArray(data.sources) && Number.isFinite(Date.parse(data.generatedAt)));
}

export function olderFeed(previous,next) {
  return Number.isFinite(Date.parse(previous?.generatedAt)) && Date.parse(next.generatedAt) < Date.parse(previous.generatedAt);
}

const fingerprint = article => JSON.stringify([
  article.title,article.summary,article.detailedSummary,article.whyImportant,article.personalRelevance,
  article.importanceScore,article.summaryState,article.summaryBasis,article.figures,article.videoSections,article.videoRequirements
]);

export function describeFeedRefresh(previous,next) {
  if (!previous.length) return '最新の公開データを確認しました';
  const known = new Map(previous.map(article => [article.id,article]));
  const added = next.filter(article => !known.has(article.id)).length;
  if (added) return `新着${added}件を反映しました`;
  if (next.some(article => fingerprint(article) !== fingerprint(known.get(article.id))) || next.length !== previous.length) return '記事の内容を更新しました';
  return '新着はありません';
}
