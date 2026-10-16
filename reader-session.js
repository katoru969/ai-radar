// Keep one reading batch stable while background updates and understood-state changes happen.
export function tokyoDay(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function createReaderSession(articles,key) {
  const unique = new Map();
  for (const article of articles) if (article?.id && !unique.has(article.id)) unique.set(article.id,article);
  const batch = [...unique.values()].slice(0,10);
  return {key,articles:batch,activeId:batch[0]?.id || null};
}

export function readerPage(session,understoodIds = []) {
  const done = new Set(understoodIds), articles = session?.articles || [];
  const unread = articles.filter(article => !done.has(article.id));
  const currentIndex = articles.findIndex(article => article.id === session?.activeId);
  const article = unread.find(article => article.id === session?.activeId)
    || articles.slice(currentIndex + 1).find(article => !done.has(article.id)) || unread[0] || null;
  const unreadIndex = unread.findIndex(item => item.id === article?.id);
  return {article,unread,total:articles.length,position:article ? articles.indexOf(article) + 1 : articles.length,
    previousId:unread[unreadIndex - 1]?.id || null,nextId:unread[unreadIndex + 1]?.id || null};
}

export function focusReaderArticle(session,id,understoodIds = []) {
  if (!session || understoodIds.includes(id) || !session.articles.some(article => article.id === id)) return session;
  return {...session,activeId:id};
}

export function readerTitle(article) {
  const title = String(article?.title || '');
  // Author/platform suffixes remain available in the original-title disclosure.
  return (article?.sourceType === 'note' ? title.split(/[｜|]/u)[0] : title)
    .replace(/\s+- (?:Qiita|YouTube)$/u,'').trim();
}

export function summaryPoints(summary) {
  const sentences = String(summary || '').trim().match(/[^。！？]+[。！？]?/gu) || [];
  return sentences.length <= 3 ? sentences : [...sentences.slice(0,2),sentences.slice(2).join('')];
}
