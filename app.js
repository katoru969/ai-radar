import {INTERESTS,SOURCE_TYPES,SOURCE_LABELS,SOCIAL_TYPES,TERM_NAMES,GRADE_LABELS,TODAY_LIMIT,safeUrl,readerFit,selectToday,isFreshArticle,normalizePreferences} from './shared.js';
import {TERMS} from './terms.js';
import {evaluateImportance,WORK_PRIORITIES,applyTodayGrades} from './importance.js';
import {sanitizeFigures,sanitizeVideoSections} from './article-details.js';
import {feedRequestUrl,validFeedPayload,olderFeed,describeFeedRefresh} from './feed-refresh.js';
import {READING_KEY,normalizeReadingState,setArticleUnderstood,toggleArticleBookmark,findReadingArticle,readingCollection} from './article-state.js';
import {createReaderSession,readerPage,focusReaderArticle,tokyoDay,readerTitle,summaryPoints} from './reader-session.js';
import {icon} from './ui-icons.js';

const PREFS_KEY = 'ai-radar-prefs', FEED_KEY = 'ai-radar-feed-v1';
const labels = SOURCE_LABELS;
const FEED_PATH = document.querySelector('meta[name="ai-radar-feed"]')?.content || './api/feed';
const STATIC_FEED = FEED_PATH.endsWith('feed.json');
const app = document.getElementById('app'), sheet = document.getElementById('sheet'), detail = document.getElementById('detail'), panel = document.getElementById('panel'), nav = document.querySelector('.bottom-nav');
let prefs = loadPrefs(), activeTab = tabFromHash(), exploreFilter = 'all', exploreSearch = '', learnFilter = 'all';
let reading = normalizeReadingState(readStorage(READING_KEY),normalizeArticle), collectionFilter = 'all', openedArticle = null;
let exploreFilterScroll = 0;
let feed = loadCachedFeed(), loading = false, connection = feed.articles.length ? 'cached' : 'initial', lastAttempt = 0;
let returnFocus = null, backArticleId = null, toastTimer;
let lastConfirmedAt = null, refreshMessage = '';
let todaySession = null, todayMode = 'reader';

function readStorage(key) {try {return JSON.parse(localStorage.getItem(key) || 'null');} catch {return null;}}
function writeStorage(key, value) {try {localStorage.setItem(key,JSON.stringify(value)); return true;} catch {return false;}}
function loadPrefs() {
  return normalizePreferences(readStorage(PREFS_KEY));
}
function savePrefs() {if (!writeStorage(PREFS_KEY,{...prefs,version:4})) toast('このブラウザでは設定を保存できません');}
function normalizeArticle(item) {
  if (!item || !SOURCE_TYPES.includes(item.sourceType) || !safeUrl(item.url) || !item.id || !Number.isFinite(Date.parse(item.publishedAt))) return null;
  const text = name => typeof item[name] === 'string' ? item[name] : '';
  item = {...item,detailedSummary:text('detailedSummary').slice(0,650),bodyUrl:safeUrl(text('bodyUrl')),figures:sanitizeFigures(item.figures,text('bodyUrl') || item.url),videoSections:item.summaryBasis === 'video-transcript' ? sanitizeVideoSections(item.videoSections,item.url) : [],videoChapters:sanitizeVideoSections(item.videoChapters,item.url,{chapters:true}),videoRequirements:item.summaryBasis === 'video-transcript' && Array.isArray(item.videoRequirements) ? item.videoRequirements.filter(value=>typeof value === 'string').slice(0,4).map(value=>value.slice(0,180)) : []};
  return {...item, id:String(item.id), title:text('title'), source:text('source'), summary:text('summary'), whyImportant:text('whyImportant'), personalRelevance:text('personalRelevance'), originalTitle:text('originalTitle'), originalSummary:text('originalSummary'), url:safeUrl(item.url), linkedUrl:safeUrl(item.linkedUrl), discussionUrl:safeUrl(item.discussionUrl), thumbnail:safeUrl(item.thumbnail), ...evaluateImportance(item,{workPriorities:prefs.workPriorities}), terms:Array.isArray(item.terms) ? [...new Set(item.terms.filter(term => TERM_NAMES.includes(term)))] : [], topics:Array.isArray(item.topics) ? item.topics.filter(topic => INTERESTS.includes(topic)) : []};
}
function normalizeFeed(data) {
  return {articles:Array.isArray(data?.articles) ? data.articles.slice(0,100).map(normalizeArticle).filter(Boolean) : [], sources:Array.isArray(data?.sources) ? data.sources.filter(source => source && SOURCE_TYPES.includes(source.sourceType)).map(source => ({...source, count:Math.max(0,Number(source.count) || 0)})) : [], generatedAt:Number.isFinite(Date.parse(data?.generatedAt)) ? data.generatedAt : null, checkedAt:Number.isFinite(Date.parse(data?.checkedAt)) ? data.checkedAt : null, refreshAfter:15 * 60000, summary:data?.summary || {mode:'rules'}};
}
function loadCachedFeed() {return normalizeFeed(readStorage(FEED_KEY));}
function esc(value = '') {return String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function timeLabel(iso) {
  const age = Math.max(0,Date.now() - Date.parse(iso));
  if (age < 3600000) return '1時間未満';
  if (age < 86400000) return `${Math.floor(age / 3600000)}時間前`;
  if (age < 7 * 86400000) return `${Math.floor(age / 86400000)}日前`;
  return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',timeZone:'Asia/Tokyo'}).format(new Date(iso));
}
function fullDate(iso,precision = 'datetime') {return iso ? new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',...(precision === 'day' ? {} : {timeStyle:'short'}),timeZone:'Asia/Tokyo'}).format(new Date(iso)) : '未取得';}
function tabFromHash() {const tab = location.hash.slice(1); return ['today','explore','learn','settings'].includes(tab) ? tab : 'today';}
function header(title = 'AI Radar',subtitle = 'あなたのAI情報レーダー') {
  return `<header><div class="brand"><img class="brand-logo" src="./icon-180.png" alt="" width="44" height="44"><div><h1>${title}</h1><div class="sub">${subtitle}</div></div></div><button class="iconbtn" data-action="sync" aria-label="ニュースを更新" ${loading ? 'disabled' : ''}>${icon('arrows-clockwise',loading ? 'spinning' : '')}</button></header>`;
}
function statusText() {
  if (loading) return STATIC_FEED ? '最新の公開データを確認中…' : '最新情報を集めています…';
  if (connection === 'offline') return feed.articles.length ? 'オフライン・保存済み記事' : 'オフライン・接続すると取得できます';
  if (connection === 'error') return feed.articles.length ? '取得できませんでした・保存済み記事' : '取得できませんでした・もう一度更新';
  if (connection === 'cached') return '保存済み記事・更新を待っています';
  if (!feed.articles.length) return '記事を取得できませんでした';
  const ok = feed.sources.filter(source => ['ok','empty','partial'].includes(source.status)).length;
  if (STATIC_FEED && Date.now() - Date.parse(feed.generatedAt) > 8 * 3600000) return `収集から${Math.floor((Date.now() - Date.parse(feed.generatedAt)) / 3600000)}時間・新着の反映待ち`;
  const clock = new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(new Date(feed.generatedAt));
  return `${ok}/${feed.sources.length}${STATIC_FEED ? '情報源・収集' : '接続・更新'} ${clock}`;
}
function refreshFeedback() {
  if (loading || !refreshMessage) return '';
  const time = lastConfirmedAt ? new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Tokyo'}).format(new Date(lastConfirmedAt)) : '';
  return `<small class="refresh-feedback">${esc(refreshMessage)}${time ? `<span>公開データの確認 ${esc(time)}</span>` : ''}</small>`;
}
function statusStrip() {
  const live = connection === 'live' && feed.sources.every(source => ['ok','empty'].includes(source.status)) && Date.now() - Date.parse(feed.generatedAt) <= 8 * 3600000;
  return `<div class="status-strip" role="status" aria-live="polite"><span class="status-dot ${live ? 'live' : ''}" aria-hidden="true"></span><span class="status-copy">${esc(statusText())}${refreshFeedback()}</span><button class="sync" data-action="sync" ${loading ? 'disabled' : ''}>${loading ? '確認中' : '更新'}</button></div>`;
}
function sourceIsCached(article) {return connection !== 'live' || feed.sources.some(source => source.id === article.sourceId && source.status === 'cached');}
function baseAssessment(article) {return {...article,...evaluateImportance(article,{workPriorities:prefs.workPriorities})};}
function priorityContext() {
  const base=feed.articles.filter(article=>prefs.sources[article.sourceType] && readerFit(article).eligible).map(baseAssessment);
  const today=selectToday(base,{...prefs,understoodArticleIds:reading.understoodIds}).sort((a,b)=>a.importancePlacement.rank-b.importancePlacement.rank);
  return {articles:applyTodayGrades(base,today),today,byId:new Map(today.map(article=>[article.id,article]))};
}
function assessArticle(article,context=priorityContext()) {return context.byId.get(article.id) || baseAssessment(article);}
function visibleArticles() {return priorityContext().articles;}
function emptyState(message, retry = false, action = 'settings') {
  return `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">〰</div><p>${esc(message)}</p>${retry ? '<button class="secondary" data-action="sync">もう一度取得する</button>' : `<button class="secondary" data-action="${action}">${action === 'explore' ? 'Exploreで読み返す' : '情報源を確認する'}</button>`}</div>`;
}
function articleActions(article,{reader = false} = {}) {
  const understood = reading.understoodIds.includes(article.id), bookmarked = reading.bookmarks.some(entry => entry.article.id === article.id);
  return `<div class="${reader ? 'reader-actions' : 'article-actions'}" data-reading-actions="${esc(article.id)}"><button class="reading-action ${reader ? 'reader-primary' : ''} ${understood ? 'is-understood' : ''}" data-reading-action="understood" data-article-id="${esc(article.id)}" ${reader ? '' : `aria-pressed="${understood}"`} aria-label="${understood ? '理解済みを解除する' : reader ? '理解済みにして次の記事へ' : 'この記事を理解済みにする'}">${icon('check')}<span>${understood ? '理解済み' : reader ? '理解した！ 次へ' : '理解した！'}</span>${reader ? icon('caret-right','reader-next-icon') : ''}</button><button class="reading-action ${reader ? 'reader-bookmark' : ''} ${bookmarked ? 'is-bookmarked' : ''}" data-reading-action="bookmark" data-article-id="${esc(article.id)}" aria-pressed="${bookmarked}" aria-label="${bookmarked ? 'ブックマークを解除する' : 'この記事をブックマークする'}">${icon('bookmark-simple')}<span>${bookmarked ? '保存済み' : 'ブックマーク'}</span></button></div>`;
}
function newsCard(article) {
  return `<article class="card importance-${article.importanceGrade.toLowerCase()}" data-article-id="${esc(article.id)}"><button class="article-open" data-news-id="${esc(article.id)}" aria-label="${esc(article.title)}の詳細を読む"><div class="badge">${gradeBadge(article)}<div class="source-meta"><span class="source">${esc(article.source)}</span><span class="ago">${sourceIsCached(article) ? '保存済み · ' : ''}${timeLabel(article.publishedAt)}</span></div></div>${freshnessBadge(article)}<h3 class="title">${esc(article.title)}</h3><p class="summary">${esc(article.summary)}</p></button><div class="article-footer"><div class="tags">${article.terms.slice(0,2).map(term => `<button class="tag" data-term="${esc(term)}" data-back-id="${esc(article.id)}">${esc(term)}</button>`).join('')}</div><button class="text-btn" data-news-id="${esc(article.id)}">詳しく <span aria-hidden="true">›</span></button></div>${articleActions(article)}</article>`;
}
function gradeBadge(article) {return `<span class="priority-mark"><span class="grade ${article.importanceGrade.toLowerCase()}">${article.importanceGrade}</span><span class="grade-label">${GRADE_LABELS[article.importanceGrade]}</span></span>`;}
function freshnessBadge(article) {return isFreshArticle(article) ? '<span class="fresh-label">新着・24時間以内</span>' : '';}
function sourceErrorLabel(source) {
  if (/^http_\d{3}$/.test(source.error || '')) return `配信元がエラーを返しました（${source.error.slice(5)}）`;
  return {timeout:'配信元の応答待ちで時間切れ',connection_reset:'配信元との通信が途中で切れました',dns_error:'配信元の接続先を確認できませんでした',youtube_page_changed:'動画一覧を読み取れませんでした',youtube_metadata_missing:'動画の公開情報を取得できませんでした',anthropic_page_changed:'公式ページの形式が変わっています'}[source.error] || '配信元に接続できませんでした';
}
function sourceStateHtml(source) {
  const label = {ok:`${source.count}件取得`,empty:'新着なし',error:'取得失敗',cached:'保存分を表示',partial:`${source.count}件・一部取得失敗`}[source.status] || '確認中';
  return `${label}${source.error ? `<small>${esc(sourceErrorLabel(source))}</small>` : source.recoveryReason ? `<small>RSSの配信エラーから復旧・${source.retrievalMethod === 'youtube-page' ? '公開ページで取得' : '再取得に成功'}</small>` : ''}${source.feedError ? `<small>RSS：${esc(sourceErrorLabel({error:source.feedError}))}</small>` : ''}${source.cachedCount ? `<small>うち${source.cachedCount}件は保存分・${esc(fullDate(source.cachedFetchedAt))}</small>` : ''}`;
}
function todayPage() {
  const key = `${tokyoDay()}|${JSON.stringify([prefs.sources,prefs.workPriorities,prefs.interests])}`;
  if (!todaySession || todaySession.key !== key || !todaySession.articles.length) {
    todaySession = createReaderSession(priorityContext().today,key);
  }
  const page = readerPage(todaySession,reading.understoodIds);
  if (page.article) todaySession = focusReaderArticle(todaySession,page.article.id,reading.understoodIds);
  return page;
}
function availableArticle(id) {
  return findReadingArticle(id,feed.articles,reading) || todaySession?.articles.find(article => article.id === id) || (openedArticle?.id === id ? openedArticle : null);
}
function readerUpdatedText() {
  if (loading) return '更新を確認中';
  if (connection === 'offline') return 'オフライン';
  if (connection === 'error') return '保存分を表示';
  if (!feed.generatedAt) return '未取得';
  const sameDay = tokyoDay(feed.generatedAt) === tokyoDay();
  return `${new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',...(sameDay ? {} : {month:'numeric',day:'numeric'}),hour:'2-digit',minute:'2-digit'}).format(new Date(feed.generatedAt))} 更新`;
}
function readerHeader(page) {
  const date = new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Tokyo'}).format(new Date());
  const failed = feed.sources.filter(source => ['error','cached','partial'].includes(source.status));
  return `${header()}<div class="reader-masthead"><div class="reader-dateline"><span>${date}</span><button data-action="sync" class="reader-update" ${loading ? 'disabled' : ''} aria-label="${esc(statusText())}。ニュースを更新">${esc(readerUpdatedText())}</button></div><div class="reader-view-controls"><button data-action="${todayMode === 'reader' ? 'today-list' : 'today-reader'}" class="reader-view-button">${todayMode === 'reader' ? '一覧へ' : '読む'}${icon('caret-right')}</button><span class="reader-position" aria-label="${todayMode === 'reader' ? `${page.total}件中${page.position}件目` : `未読${page.unread.length}件`}">${todayMode === 'reader' ? `${String(page.position).padStart(2,'0')} / ${page.total}` : `未読 ${page.unread.length}`}</span></div></div>${failed.length ? `<button class="reader-health" data-action="settings">${icon('warning-circle')}<span>${failed.length}情報源で一部取得できませんでした</span>${icon('caret-right')}</button>` : connection === 'offline' || connection === 'error' ? `<p class="reader-health">${icon('info')}<span>${esc(statusText())}</span></p>` : ''}<span class="sr-only" role="status" aria-live="polite">${esc(statusText())}。${esc(refreshMessage)}</span>`;
}
function summaryBasisLabel(article) {
  return article.summaryBasis === 'video-transcript' ? `${article.captionKind === 'auto' ? '日本語の自動字幕' : '日本語字幕'}${article.videoSummaryOrigin === 'reviewed' ? 'を確認して整理' : 'から抽出'}（映像は未確認）` : {article:'日本語の記事本文から抽出',feed:'日本語の配信抜粋から抽出','video-description':'説明欄で確認できた内容のみ。字幕・ハンズオンの中身は未確認',unavailable:'日本語の本文を確認できていません'}[article.summaryBasis] || '日本語の本文を確認できていません';
}
function readerSectionTitle(symbol,title,tone = '') {
  return `<span class="reader-section-symbol ${tone}">${icon(symbol)}</span><span>${title}</span>`;
}
function readerContent(article) {
  const points = summaryPoints(article.summary);
  const detailTitle = article.sourceType === 'youtube' && !article.detailedSummary ? '動画の内容を確認する' : '詳しいまとめ';
  const paragraphs = article.detailedSummary ? article.detailedSummary.split(/\n+/).filter(Boolean) : [article.sourceType === 'youtube' ? '文字起こしを自動取得できず、内容は未確認です。元動画や下のチャプターから確認できます。' : '日本語の本文を取得できなかったため、原文で内容を確認できます。'];
  return `<section class="reader-section"><h3>${readerSectionTitle('text-align-left','要点')}</h3>${points.length ? `<ul class="reader-points">${points.map(point => `<li>${esc(point)}</li>`).join('')}</ul>` : '<p>配信元の原文で内容を確認できます。</p>'}</section>
    <section class="reader-section reader-relevance"><h3>${readerSectionTitle('user','自分にどう関係するか','mint')}</h3><p>${esc(personalHint(article))}</p></section>
    <details class="reader-section reader-why"><summary>${readerSectionTitle('question','なぜ重要か')}${icon('caret-down','disclosure-caret')}</summary><p>${esc(article.whyImportant)}</p></details>
    <section class="reader-section reader-detailed"><h3>${readerSectionTitle('book-open',detailTitle)}</h3>${paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}<span class="summary-basis">${esc(summaryBasisLabel(article))}</span></section>`;
}
function readerList(page) {
  return `<section class="reader-overview"><div class="reader-overview-heading"><h2>今日の重要ニュース</h2><button class="text-btn" data-action="about">A / B / C の見方</button></div><p class="reading-hint">気になる記事から読めます。理解した記事は一覧から外れます。</p>${page.unread.map(article => `<button class="reader-list-entry importance-${article.importanceGrade.toLowerCase()}" data-reader-article="${esc(article.id)}"><div class="badge">${gradeBadge(article)}<span class="source">${esc(article.source)}</span></div><h3>${esc(readerTitle(article))}</h3><p class="summary">${esc(article.summary)}</p><span class="reader-list-footer"><span>${timeLabel(article.publishedAt)}</span><span>読む ${icon('caret-right')}</span></span></button>`).join('')}</section>`;
}
function renderToday() {
  const page = todayPage();
  document.body.classList.toggle('reader-active',todayMode === 'reader' && !!page.article);
  if (!page.article) {
    app.innerHTML = `${readerHeader(page)}${loading && !page.total ? '<div class="skeleton"></div>' : page.total ? `<section class="reader-finish"><span class="reader-finish-icon">${icon('check')}</span><h2>今日はここまで。</h2><p>${page.total}件の記事を理解しました。<br>保存した記事はExploreで読み返せます。</p><button class="primary" data-action="explore-bookmarks">保存した記事を読む</button><button class="secondary" data-action="today-restart">ほかの未読記事を探す</button></section>` : emptyState(feed.articles.length ? '直近30日の未読の活用記事はありません。理解済みの記事はExploreで読み返せます。' : '最新記事を取得すると、ここに表示されます。',!feed.articles.length,'explore')}`;
    return;
  }
  if (todayMode === 'list') {app.innerHTML = `${readerHeader(page)}${readerList(page)}`;return;}
  const article = assessArticle(page.article), sourceLabel = `${article.source} · ${timeLabel(article.publishedAt)}`;
  openedArticle = article;
  app.innerHTML = `${readerHeader(page)}<article class="reader-article importance-${article.importanceGrade.toLowerCase()}" data-article-id="${esc(article.id)}"><div class="reader-article-meta">${gradeBadge(article)}<span class="reader-source">${esc(sourceLabel)}</span></div><h2 class="reader-title" id="readerTitle" tabindex="-1">${esc(readerTitle(article))}</h2>${readerContent(article)}
    <a class="reader-original-link" href="${esc(article.url)}" target="_blank" rel="noopener noreferrer">${article.sourceType === 'youtube' ? '元の動画を見る' : '原文を読む'} ${icon('arrow-up-right')}</a>${videoGuide(article)}${articleFigures(article)}
    ${article.terms.length ? `<section class="reader-section reader-terms"><h3>関連AI用語</h3><div class="tags">${article.terms.map(term => `<button class="tag" data-term="${esc(term)}" data-back-id="${esc(article.id)}">${esc(term)}</button>`).join('')}</div></section>` : ''}
    <details class="reader-extra"><summary>元の見出し・出典・評価の理由 ${icon('caret-down')}</summary><p>${esc(article.title)}</p><p>${esc(fullDate(article.publishedAt,article.publishedAtPrecision))} · ${esc(article.source)}</p><p>${esc(article.importanceReason)}</p><p>${esc(summaryBasisLabel(article))}</p>${article.bodyUrl && article.bodyUrl !== article.url ? `<a class="reader-original-link" href="${esc(article.bodyUrl)}" target="_blank" rel="noopener noreferrer">日本語の本文を読む ${icon('arrow-up-right')}</a>` : ''}${[[article.linkedUrl,'共有された記事を読む'],[article.discussionUrl,'Hacker Newsの議論を読む']].filter(([url])=>url && url !== article.url && url !== article.bodyUrl).map(([url,label])=>`<a class="reader-original-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ${icon('arrow-up-right')}</a>`).join('')}</details>
    <div class="reader-paging"><button data-reader-article="${esc(page.previousId || '')}" ${page.previousId ? '' : 'disabled'}>${icon('caret-left')}前の記事</button><button data-reader-article="${esc(page.nextId || '')}" ${page.nextId ? '' : 'disabled'}>次の記事${icon('caret-right')}</button></div><p class="reader-endnote">内容を確認できた範囲でまとめています。<br>「次の記事」で移動するだけでは理解済みになりません。</p></article>${articleActions(article,{reader:true})}`;
}
function exploredArticles() {
  const query = exploreSearch.trim().toLocaleLowerCase(),context=priorityContext();
  return readingCollection(context.articles,reading,collectionFilter).map(article=>assessArticle(article,context)).filter(article => (exploreFilter === 'all' || article.sourceType === exploreFilter) && (!query || `${article.title} ${article.originalTitle} ${article.summary} ${article.source} ${article.terms.join(' ')}`.toLocaleLowerCase().includes(query))).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
function exploreResults() {
  const articles = exploredArticles();
  return articles.length ? articles.map(article => `<article class="feed-item importance-${article.importanceGrade.toLowerCase()}" data-article-id="${esc(article.id)}"><button class="feed-open" data-news-id="${esc(article.id)}" aria-label="${esc(article.title)}の詳細を読む"><div class="feed-top">${gradeBadge(article)}<div class="source-meta"><b class="source">${esc(article.source)}</b><span class="ago">${timeLabel(article.publishedAt)}</span></div></div>${freshnessBadge(article)}<div class="feed-title">${esc(article.title)}</div><p class="summary">${esc(article.summary)}</p><div class="feed-bottom"><span class="tag">${labels[article.sourceType]}</span><span class="mini-grade">${esc(article.readerCategory || readerFit(article).category)}</span></div></button>${articleActions(article)}</article>`).join('') : `<div class="empty">${collectionFilter === 'bookmarked' ? 'ブックマークした記事がここに並びます。' : collectionFilter === 'understood' ? '表示できる理解済みの記事はありません。' : exploreFilter !== 'all' && !prefs.sources[exploreFilter] ? 'この情報源はOFFです。SettingsでONにできます。' : loading ? '記事を取得しています…' : exploreFilter === 'github' ? '開発者向けSDKの収集は停止しています。' : '該当する活用記事がありません。'}</div>`;
}
function renderExplore() {
  const previousBar = app.querySelector('[aria-label="情報源フィルター"]');
  if (previousBar) exploreFilterScroll = previousBar.scrollLeft;
  app.innerHTML = `${header('Explore','気になる情報を、もう少し詳しく')}<div class="filter-bar collection-bar" aria-label="記事の保存・理解フィルター">${[['all','すべて'],['bookmarked',`ブックマーク ${reading.bookmarks.length}`],['understood','理解済み']].map(([key,label]) => `<button class="chip ${collectionFilter === key ? 'active' : ''}" data-collection="${key}" aria-pressed="${collectionFilter === key}">${label}</button>`).join('')}</div><label class="sr-only" for="exploreSearch">ニュースを検索</label><input class="searchbox" id="exploreSearch" type="search" placeholder="ニュース・用語を検索" value="${esc(exploreSearch)}" autocomplete="off"><div class="filter-bar" aria-label="情報源フィルター">${['all',...SOURCE_TYPES].map(type => `<button class="chip ${exploreFilter === type ? 'active' : ''}" data-filter="${type}" aria-pressed="${exploreFilter === type}">${type === 'all' ? 'All' : labels[type]}</button>`).join('')}</div>${statusStrip()}<div class="section-title"><h2 class="list-heading">${collectionFilter === 'bookmarked' ? 'ブックマークした記事' : collectionFilter === 'understood' ? '理解済みの記事' : '新着の記事'}</h2><span id="resultCount">${exploredArticles().length}件</span></div><div id="exploreResults">${exploreResults()}</div><p class="footnote">理解状況とブックマークはこの端末のブラウザに保存します。<br>ブックマークは記事が新着一覧から外れたあとも読み返せます。</p>`;
  app.querySelector('[aria-label="情報源フィルター"]').scrollLeft = exploreFilterScroll;
}
function renderLearn() {
  const entries = Object.entries(TERMS), done = prefs.understood.length;
  const filtered = entries.filter(([term]) => learnFilter === 'all' || (learnFilter === 'done') === prefs.understood.includes(term));
  app.innerHTML = `${header('Learn','AI用語を、ひとつずつ')}<div class="progress-card"><div class="badge"><span>あなたの学習進捗</span><span class="ago">${done} / ${entries.length}語</span></div><div class="progress-line" role="progressbar" aria-label="用語の理解状況" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${entries.length}"><div class="progress-fill" style="width:${done / entries.length * 100}%"></div></div><p class="sub">タップすると、3段階の説明が読めます。</p></div><div class="filter-bar" aria-label="学習状態フィルター">${[['all','すべて'],['todo','未学習'],['done','理解済み']].map(([key,label]) => `<button class="chip ${learnFilter === key ? 'active' : ''}" data-learn-filter="${key}" aria-pressed="${learnFilter === key}">${label}</button>`).join('')}</div><div class="list-card">${filtered.length ? filtered.map(([term,value]) => {const understood = prefs.understood.includes(term); return `<button class="list-row term-row" data-term="${esc(term)}"><span class="term-dot ${understood ? 'done' : ''}" aria-hidden="true"></span><span class="main"><b>${esc(term)}</b><span class="sub">${esc(value.short)}</span></span><span class="term-state ${understood ? 'done' : ''}">${understood ? '理解済み' : '未学習'}</span><span class="chev" aria-hidden="true">›</span></button>`;}).join('') : '<div class="empty">該当する用語はありません。</div>'}</div>`;
}
function switchRow(type,key,on,title,description,disabled = false) {
  return `<div class="toggle-row"><div class="toggle-copy"><b>${esc(title)}</b><span>${esc(description)}</span></div><button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-toggle="${type}" data-key="${key}" aria-label="${esc(title)}" ${disabled ? 'disabled' : ''}></button></div>`;
}
function renderSettings() {
  const descriptions = {official:'ChatGPT・Claude・Geminiなどの機能・料金',youtube:'チャエン・AI仙人・PIVOT・安野貴博関連・いけとも・KEITO・OpenAI',note:'NotebookLM・Obsidian・AI活用の実務記事を重点収集',github:'SDK収集は停止中（設定は保存できます）',zenn:'ChatGPT・Gemini・NotebookLMの実務解説',qiita:'ChatGPT・Gemini・NotebookLMの実務解説',bluesky:'公開投稿から個人で使える情報を選別',hackernews:'海外の話題からAIの活用情報を選別',mastodon:'公開投稿から個人で使える情報を選別'};
  app.innerHTML = `${header('Settings','自分に合うレーダーに')}<section class="settings-group"><h2>重要度で優先する仕事</h2><p class="hint">選んだ仕事への効果を同じ比重で評価します。設定はこの端末に保存されます。</p><div class="chips">${Object.entries(WORK_PRIORITIES).map(([key,label])=>`<button class="chip ${prefs.workPriorities.includes(key) ? 'active' : ''}" data-work-priority="${key}" aria-pressed="${prefs.workPriorities.includes(key)}">${esc(label)}</button>`).join('')}</div></section><section class="settings-group"><h2>興味のある分野</h2><p class="hint">新機能・料金・具体的な使い方を優先します。Todayの並び順に反映します。</p><div class="chips">${INTERESTS.map(interest => `<button class="chip ${prefs.interests.includes(interest) ? 'active' : ''}" data-interest="${esc(interest)}" aria-pressed="${prefs.interests.includes(interest)}">${esc(interest)}</button>`).join('')}</div></section><section class="settings-group"><h2>情報源</h2><p class="hint">ONにした情報源をTodayとExploreに表示します。</p><div class="toggle-wrap">${SOURCE_TYPES.map(type => switchRow('source',type,prefs.sources[type],labels[type],descriptions[type])).join('')}</div></section><section class="settings-group"><h2>通知の希望</h2><p class="hint">設定を保存できます。通知の配信機能は準備中です。</p><div class="toggle-wrap">${switchRow('notification','important',prefs.notifications.important,'重要ニュース','重要度Aのニュースをお知らせ')}${switchRow('notification','digest',prefs.notifications.digest,'朝のダイジェスト','毎日のまとめをお知らせ')}</div></section><section class="settings-group"><h2>取得状況</h2><p class="hint">${STATIC_FEED ? "情報は約3時間ごとに自動収集。このボタンは最新の公開分を確認します。収集・反映が遅れる場合があります。" : "このボタンで情報源の最新データを確認します。"}</p><div class="tiny-note" role="status" aria-live="polite"><span class="status-dot ${connection === 'live' ? 'live' : ''}"></span> ${esc(statusText())}<br><span>最終収集 ${esc(fullDate(feed.generatedAt))}</span>${refreshFeedback()}<details><summary>情報源ごとの状態</summary>${feed.sources.length ? feed.sources.map(source => `<div class="source-status"><span>${esc(source.name)}</span><span class="${['error','cached','partial'].includes(source.status) ? 'status-warning' : ''}">${sourceStateHtml(source)}</span></div>`).join('') : '<p>まだ取得していません。</p>'}</details></div><button class="secondary" data-action="sync" ${loading ? 'disabled' : ''}>${loading ? '更新しています…' : 'ニュースを更新する'}</button></section><section class="settings-group"><h2>iPhoneで使う</h2><button class="secondary" data-action="install">ホーム画面に追加する方法 <span aria-hidden="true">›</span></button></section><section class="settings-group"><button class="secondary" data-action="reset-learning">学習状況をリセット</button><p class="footnote">学習状況・設定はこの端末に保存されます。<br>AI Radar · Version 1.8.0 · 無料の本文・字幕まとめ</p></section>`;
}
function render() {
  app.classList.toggle('today-app',activeTab === 'today');
  if (activeTab !== 'today') document.body.classList.remove('reader-active');
  const searchFocused = document.activeElement?.id === 'exploreSearch';
  const selection = searchFocused ? [document.activeElement.selectionStart,document.activeElement.selectionEnd] : null;
  ({today:renderToday,explore:renderExplore,learn:renderLearn,settings:renderSettings}[activeTab])();
  document.querySelectorAll('[data-tab]').forEach(button => {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle('active',selected);
    if (selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  if (searchFocused && activeTab === 'explore' && !sheet.classList.contains('open')) {
    const input = document.getElementById('exploreSearch'); input.focus({preventScroll:true});
    try {input.setSelectionRange(...selection);} catch {}
  }
}
function navigate(tab) {
  closeSheet();
  if (activeTab === tab && tab === 'today' && todayMode === 'list') {todayMode = 'reader';render();window.scrollTo({top:0,behavior:'auto'});return;}
  if (activeTab === tab) {window.scrollTo({top:0,behavior:'smooth'}); return;}
  location.hash = tab;
}
function openSheet() {
  if (!sheet.classList.contains('open')) returnFocus = document.activeElement;
  sheet.classList.add('open'); sheet.setAttribute('aria-hidden','false');
  app.inert = true; nav.inert = true; document.body.classList.add('modal-open');
  panel.scrollTop = 0;
  document.getElementById('closeSheet').focus({preventScroll:true});
}
function closeSheet() {
  if (!sheet.classList.contains('open')) return;
  sheet.classList.remove('open'); sheet.setAttribute('aria-hidden','true');
  app.inert = false; nav.inert = false; document.body.classList.remove('modal-open');
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  else document.querySelector(`[data-tab="${activeTab}"]`).focus({preventScroll:true});
}
function personalHint(article) {
  if (prefs.interests.includes('調べもの・学習') && article.topics.includes('調べもの・学習')) return '調べものや資料の整理に使えそうなら、紹介された機能を小さな作業で試せます。';
  return article.personalRelevance;
}
function timestampText(seconds) {return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;}
function articleFigures(article) {
  if (!article.figures.length) return '';
  return `<section class="article-figures" aria-label="元記事の図解"><h3>図で理解する</h3>${article.figures.map(figure=>`<figure class="article-figure"><a href="${esc(figure.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(figure.alt)}を大きく表示"><img src="${esc(figure.url)}" alt="${esc(figure.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a><span class="figure-unavailable">画像を読み込めませんでした。元記事で確認できます。</span><figcaption>${esc(figure.caption || figure.alt)}<br><a href="${esc(figure.sourceUrl)}" target="_blank" rel="noopener noreferrer">出典：${esc(article.source)} · 元記事を見る ↗</a></figcaption></figure>`).join('')}<p class="video-note">元記事に掲載された図・画面です。タップすると大きく表示できます。</p></section>`;
}
function videoGuide(article) {
  if (article.sourceType !== 'youtube') return '';
  const confirmed = article.summaryBasis === 'video-transcript';
  if (confirmed && article.videoSections.length) return `<section class="video-guide" aria-label="動画の具体例と操作"><h3>動画の中の具体例・操作</h3>${article.videoSections.map(section=>`<div class="video-section"><h4>${esc(section.title)}</h4><ol>${section.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>${section.result ? `<p class="video-result"><b>結果・確認できたこと</b><br>${esc(section.result)}</p>` : ''}<a class="timestamp-link" href="${esc(section.url)}" target="_blank" rel="noopener noreferrer"><span>この場面を動画で見る ↗</span><span>${timestampText(section.startSeconds)}</span></a></div>`).join('')}${article.videoRequirements.length ? `<div class="explain long-summary"><h3>試す前に確認</h3>${article.videoRequirements.map(requirement=>`<p>${esc(requirement)}</p>`).join('')}</div>` : ''}</section>`;
  if (!confirmed && article.videoChapters.length) return `<section class="video-chapters" aria-label="動画のチャプター"><h3>気になる場面から見る</h3><p>説明欄の章立てです。字幕を取得できていないため、操作手順や結果は未確認です。</p>${article.videoChapters.map(chapter=>`<a class="timestamp-link" href="${esc(chapter.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(chapter.title)} ↗</span><span>${timestampText(chapter.startSeconds)}</span></a>`).join('')}</section>`;
  return '';
}
function figureLoadFailed(event) {if (event.target.matches?.('.article-figure img')) event.target.closest('.article-figure')?.classList.add('failed');}
sheet.addEventListener('error',figureLoadFailed,true);
app.addEventListener('error',figureLoadFailed,true);
function openNews(id) {
  if (activeTab === 'today' && todaySession?.articles.some(article => article.id === id) && !reading.understoodIds.includes(id)) {closeSheet();showReaderArticle(id);return;}
  const savedArticle = availableArticle(id);
  if (!savedArticle) return;
  const article=assessArticle(savedArticle);
  openedArticle = article;
  backArticleId = null;
  const posted = SOCIAL_TYPES.includes(article.sourceType);
  const sourceLabel = article.source.includes(labels[article.sourceType]) ? article.source : `${article.source} · ${labels[article.sourceType]}`;
  const link = (url,label) => `<a class="source-link secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`;
  const relatedLinks = [article.linkedUrl && article.linkedUrl !== article.url ? link(article.linkedUrl,'共有された記事を読む') : '',article.discussionUrl && article.discussionUrl !== article.url ? link(article.discussionUrl,'Hacker Newsの議論を見る') : ''].join('');
  const basisLabel = article.summaryBasis === 'video-transcript' ? `${article.captionKind === 'auto' ? '日本語の自動字幕' : '日本語字幕'}${article.videoSummaryOrigin === 'reviewed' ? 'を確認して整理' : 'から抽出'}（映像は未確認）` : {article:'日本語の記事本文から抽出',feed:'日本語の配信抜粋から抽出','video-description':'説明欄で確認できた内容のみ。字幕・ハンズオンの中身は未確認',unavailable:'日本語の本文を確認できていません'}[article.summaryBasis] || '日本語の本文を確認できていません';
  detail.innerHTML = `<div class="badge">${gradeBadge(article)}<span class="source">${esc(sourceLabel)}</span></div>
    <h2 id="detailTitle">${esc(article.title)}</h2><p class="detail-meta">${posted ? '投稿' : '公開'} ${esc(fullDate(article.publishedAt,article.publishedAtPrecision))}${sourceIsCached(article) ? ' · 保存済み記事' : ''}</p>
    <div class="explain blue"><h3>要点</h3><p>${esc(article.summary)}</p></div><div class="explain lilac"><h3>なぜ重要か</h3><p>${esc(article.whyImportant)}</p></div><div class="explain mint"><h3>自分にどう関係するか</h3><p>${esc(personalHint(article))}</p></div>
    <div class="explain long-summary"><h3>${article.sourceType === 'youtube' && !article.detailedSummary ? '動画の内容を確認する' : '詳しいまとめ'}</h3>${article.detailedSummary ? article.detailedSummary.split(/\n+/).filter(Boolean).map(paragraph=>`<p>${esc(paragraph)}</p>`).join('') : `<p>${article.sourceType === 'youtube' ? '文字起こしを自動取得できず、内容は未確認です。元動画の「文字起こしを表示」や下のチャプターから確認できます。' : '日本語の本文を取得できなかったため、詳しいまとめはまだありません。原文で内容を確認できます。'}</p>`}<span class="summary-basis">${esc(basisLabel)}${article.detailedSummary && article.summaryState === 'limited' && article.sourceType !== 'youtube' ? '。取得できた文章が短いため、まとめも短めです。' : ''}</span></div>
    <details class="original"><summary>この重要度の理由</summary><p>${esc(article.importanceReason)}</p><p class="footnote">仕事適合スコア ${article.importanceScore}点 / 100点${article.importancePlacement ? `<br>Today内の順位 ${article.importancePlacement.rank} / ${article.importancePlacement.total}件 · 今回 A ${article.importancePlacement.counts.A}件 / B ${article.importancePlacement.counts.B}件 / C ${article.importancePlacement.counts.C}件` : "<br>Today未掲載の記事：個別の仕事適合度の目安"}<br>仕事との関係 ${article.importanceFactors.relevance}/40 · 具体性 ${article.importanceFactors.action}/25 · 効果 ${article.importanceFactors.impact}/20 · 根拠 ${article.importanceFactors.evidence}/10 · 新しさ ${article.importanceFactors.freshness}/5</p>${article.importanceLimits.length ? `<p class="footnote">内容・利用条件の注意点：${article.importanceLimits.map(esc).join("。")}</p>` : ""}</details>${videoGuide(article)}${articleFigures(article)}
    <h3 class="related-heading">関連AI用語</h3><div class="tags">${article.terms.map(term => `<button class="tag" data-term="${esc(term)}" data-back-id="${esc(article.id)}">${esc(term)}</button>`).join('') || '<span class="sub">この記事に関連する用語はありません。</span>'}</div>
    <details class="original"><summary>原題・フィードの抜粋</summary><b>${esc(article.originalTitle)}</b>${article.originalSummary ? `<p>${esc(article.originalSummary.slice(0,700))}</p>` : '<p>この情報源には本文の抜粋がありません。</p>'}</details>
    <p class="footnote">活用のヒント・重要度は編集上の目安です。${posted ? '<br>表示日は投稿日時です。共有された記事の公開日とは異なる場合があります。' : ''}</p>
    ${article.bodyUrl && article.bodyUrl !== article.url ? link(article.bodyUrl,'日本語の本文を読む') : ''}${link(article.url,article.sourceType === 'youtube' ? '動画を見る' : ['bluesky','mastodon'].includes(article.sourceType) ? '投稿を読む' : '原文を読む')}${relatedLinks}${articleActions(article)}<p class="reading-hint">理解済みの記事はTodayから外れます。ボタンをもう一度押すと解除できます。</p>`;
  openSheet();
}
function openTerm(term, articleId = null) {
  const definition = TERMS[term]; if (!definition) return;
  backArticleId = articleId;
  const understood = prefs.understood.includes(term);
  detail.innerHTML = `${articleId ? `<button class="text-btn sheet-back" data-news-id="${esc(articleId)}">‹ ニュースへ戻る</button>` : ''}<span class="tag term-label">${understood ? '理解済み' : '未学習'}</span><h2 id="detailTitle">${esc(term)}</h2><div class="explain blue"><h3>① 超簡単に</h3><p>${esc(definition.short)}</p></div><div class="explain lilac"><h3>② たとえると</h3><p>${esc(definition.easy)}</p></div><div class="explain mint"><h3>③ もう少し詳しく</h3><p>${esc(definition.detail)}</p></div><button class="understand" data-understand="${esc(term)}">${understood ? '未学習に戻す' : '理解した ✓'}</button>`;
  openSheet();
}
function openInfo(type) {
  backArticleId = null;
  detail.innerHTML = type === 'install' ? '<h2 id="detailTitle">ホーム画面から、毎日。</h2><div class="explain blue"><h3>iPhoneのSafariで開く</h3><p>公開したAI RadarのURLをSafariで開きます。</p></div><div class="explain lilac"><h3>共有からホーム画面へ</h3><p>Safariの共有メニューを開き、「ホーム画面に追加」を選んで追加します。</p></div><div class="explain mint"><h3>次からはアイコンをタップ</h3><p>ニュースは開いたときに更新します。通信できないときも、前回取得した記事と用語集を確認できます。</p></div>' : '<h2 id="detailTitle">ニュースの読み方</h2><div class="explain grade-explanation-a"><h3>A · 自分に重要</h3><p>仕事に直結し、具体的な使い方や判断材料がある情報。まずこの候補を集め、Todayには2件を目安に選びます。</p></div><div class="explain grade-explanation-b"><h3>B · 試す価値あり</h3><p>用途に合うか試す情報や、使い方・利用条件を確かめたい候補。Todayには5件を目安に選びます。</p></div><div class="explain grade-explanation-c"><h3>C · 参考情報</h3><p>時間があるときに読む周辺・補足情報。Todayには3件を目安に選びます。</p></div><p class="footnote">まず論文・情報の整理、資料・文章作成、作業の自動化に役立つ記事を集め、本文を確認します。仕事との関係40点・具体性25点・効果20点・根拠10点・新しさ5点で評価し、A85点以上・B60〜84点・C59点以下を基本に判定します。その後にA2件・B5件・C3件を目安に選出します。A候補が不足してもB/Cを昇格させません。記事が足りない場合は別の候補で補い、実際の重要度を表示します。10件未満の日は比率を近い整数に調整します。重要度と、本文・字幕の確認範囲は別に表示します。理解済みの記事は除外し、直近7日を優先、候補が少ない場合は30日まで広げます。</p>';
  openSheet();
}
function toast(message,undo = null) {
  const element = document.getElementById('toast');
  clearTimeout(toastTimer); element.textContent = message; element.classList.add('show');
  element.classList.toggle('has-undo',!!undo);
  if (undo) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '戻す';
    button.addEventListener('click',() => {clearTimeout(toastTimer); if (undo() !== false) element.classList.remove('show');});
    element.append(button);
  }
  toastTimer = setTimeout(() => element.classList.remove('show'),undo ? 7000 : 2200);
}
function updateReadingView(id,action) {
  render();
  const article = availableArticle(id);
  const controls = detail.querySelector('[data-reading-actions]');
  if (article && controls?.dataset.readingActions === id) controls.outerHTML = articleActions(article);
  const scope = sheet.classList.contains('open') ? detail : app;
  const focus = scope.querySelector(`[data-reading-action="${action}"][data-article-id="${CSS.escape(id)}"]`) || scope.querySelector(`[data-reading-action="${action}"]`) || app.querySelector('[data-collection]');
  focus?.focus({preventScroll:true});
}
function changeReading(action,id) {
  const article = availableArticle(id);
  if (!article) return;
  const wasDone = reading.understoodIds.includes(id), wasSaved = reading.bookmarks.some(entry => entry.article.id === id);
  const advance = action === 'understood' && !wasDone && activeTab === 'today' && todayMode === 'reader' && !sheet.classList.contains('open');
  const next = action === 'understood' ? setArticleUnderstood(reading,id,!wasDone) : toggleArticleBookmark(reading,article);
  if (!writeStorage(READING_KEY,next)) return toast('保存できませんでした。ブラウザの保存容量を確認してください');
  reading = next; updateReadingView(id,action);
  if (advance) focusReaderStart();
  toast(action === 'understood' ? wasDone ? '理解済みを解除しました' : '理解済みにしてTodayから外しました' : wasSaved ? 'ブックマークを解除しました' : 'ブックマークに保存しました',() => {
    const restored = action === 'understood' ? setArticleUnderstood(reading,id,wasDone) : reading.bookmarks.some(entry => entry.article.id === id) === wasSaved ? reading : toggleArticleBookmark(reading,article);
    if (!writeStorage(READING_KEY,restored)) {toast('変更を保存できませんでした'); return false;}
    reading = restored;
    if (advance && todaySession?.articles.some(article => article.id === id)) todaySession = focusReaderArticle(todaySession,id,reading.understoodIds);
    updateReadingView(id,action);
    if (advance && activeTab === 'today') focusReaderStart();
  });
}
async function loadLive({manual = false} = {}) {
  if (loading) return;
  lastAttempt = Date.now();
  if (!navigator.onLine) {connection = 'offline'; refreshMessage = '接続すると最新の公開分を確認できます'; lastConfirmedAt = null; render(); if (manual) toast('オフラインのため保存済み記事を表示しています'); return;}
  const previous = feed;
  loading = true; render();
  try {
    const response = await fetch(feedRequestUrl(FEED_PATH,document.baseURI,lastAttempt),{cache:'no-store',signal:AbortSignal.timeout(40000)});
    if (!response.ok) throw new Error('feed_failed');
    const data = await response.json();
    if (!validFeedPayload(data)) throw new Error('invalid_feed');
    const next = normalizeFeed(data);
    if (olderFeed(previous,next)) throw new Error('older_feed');
    const cached = response.headers.get('X-AI-Radar-Cached') === '1';
    if (!next.articles.length) {
      if (feed.articles.length) feed = {...feed,sources:next.sources};
      else feed = next;
      connection = 'error';
      lastConfirmedAt = null; refreshMessage = '記事を取得できませんでした';
    } else {
      feed = next;
      connection = cached ? 'cached' : next.sources.some(source => ['ok','empty','partial'].includes(source.status)) ? 'live' : 'error';
      lastConfirmedAt = cached ? null : new Date().toISOString();
      refreshMessage = cached ? '通信できず保存済み記事を表示しています' : describeFeedRefresh(previous.articles.filter(article => prefs.sources[article.sourceType] && readerFit(article).eligible),visibleArticles());
      if (connection === 'error') refreshMessage = '情報源に接続できず保存済み記事を表示しています';
      writeStorage(FEED_KEY,next);
      if (manual && !cached && next.generatedAt !== previous.generatedAt) todaySession = null;
    }
  } catch (error) {
    connection = navigator.onLine ? 'error' : 'offline'; lastConfirmedAt = null;
    refreshMessage = error.message === 'older_feed' ? '新しい公開分の反映待ち・保存済み記事を表示' : '確認できませんでした・保存済み記事を表示';
  }
  finally {loading = false; render(); if (manual) toast(refreshMessage);}
}
function focusReaderStart() {
  window.scrollTo({top:0,behavior:'auto'});
  const heading = document.getElementById('readerTitle') || app.querySelector('.reader-finish h2');
  if (heading) {heading.tabIndex = -1;heading.focus({preventScroll:true});}
}
function showReaderArticle(id) {
  todaySession = focusReaderArticle(todaySession,id,reading.understoodIds);
  todayMode = 'reader';render();focusReaderStart();
}
function handleClick(event) {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.readerArticle) return showReaderArticle(button.dataset.readerArticle);
  if (button.dataset.readingAction) return changeReading(button.dataset.readingAction,button.dataset.articleId);
  if (button.dataset.newsId) return openNews(button.dataset.newsId);
  if (button.dataset.term) return openTerm(button.dataset.term,button.dataset.backId || null);
  if (button.dataset.filter) {exploreFilter = button.dataset.filter; renderExplore(); return;}
  if (button.dataset.collection) {collectionFilter = button.dataset.collection; exploreFilter = 'all'; exploreSearch = ''; renderExplore(); return;}
  if (button.dataset.learnFilter) {learnFilter = button.dataset.learnFilter; renderLearn(); return;}
  if (button.dataset.understand) {
    const term = button.dataset.understand, wasDone = prefs.understood.includes(term), articleId = backArticleId;
    prefs.understood = wasDone ? prefs.understood.filter(value => value !== term) : [...new Set([...prefs.understood,term])];
    savePrefs(); render(); openTerm(term,articleId); toast(wasDone ? '未学習に戻しました' : '理解済みにしました'); return;
  }
  if (button.dataset.workPriority) {
    const key=button.dataset.workPriority;
    prefs.workPriorities=prefs.workPriorities.includes(key) ? prefs.workPriorities.filter(value=>value!==key) : [...prefs.workPriorities,key];
    savePrefs(); renderSettings(); return;
  }
  if (button.dataset.interest) {
    const interest = button.dataset.interest;
    prefs.interests = prefs.interests.includes(interest) ? prefs.interests.filter(value => value !== interest) : [...prefs.interests,interest];
    savePrefs(); renderSettings(); return;
  }
  if (button.dataset.toggle) {
    const key = button.dataset.key, group = button.dataset.toggle === 'source' ? 'sources' : 'notifications';
    prefs[group][key] = !prefs[group][key]; savePrefs(); renderSettings(); return;
  }
  const action = button.dataset.action;
  if (action === 'today-list' || action === 'today-reader') {todayMode = action === 'today-list' ? 'list' : 'reader';render();window.scrollTo({top:0,behavior:'auto'});return;}
  if (action === 'today-restart') {todaySession = null;todayMode = 'reader';render();focusReaderStart();return;}
  if (action === 'explore-bookmarks') {collectionFilter = 'bookmarked';navigate('explore');return;}
  if (action === 'sync') loadLive({manual:true});
  if (['settings','explore'].includes(action)) navigate(action);
  if (['about','install'].includes(action)) openInfo(action);
  if (action === 'reset-learning') {prefs.understood = []; savePrefs(); renderSettings(); toast('学習状況をリセットしました');}
}
app.addEventListener('click',handleClick); detail.addEventListener('click',handleClick);
nav.addEventListener('click',event => {const button = event.target.closest('[data-tab]'); if (button) navigate(button.dataset.tab);});
app.addEventListener('input',event => {
  if (event.target.id !== 'exploreSearch') return;
  exploreSearch = event.target.value;
  document.getElementById('exploreResults').innerHTML = exploreResults();
  document.getElementById('resultCount').textContent = `${exploredArticles().length}件`;
});
document.getElementById('closeSheet').addEventListener('click',closeSheet);
sheet.addEventListener('click',event => {if (event.target === sheet) closeSheet();});
document.addEventListener('keydown',event => {
  if (!sheet.classList.contains('open')) return;
  if (event.key === 'Escape') {event.preventDefault(); closeSheet();}
  if (event.key !== 'Tab') return;
  const focusable = [...panel.querySelectorAll('button:not([disabled]),a[href],summary,input'),...document.querySelectorAll('.toast.show button')];
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
  else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
});
window.addEventListener('hashchange',() => {closeSheet(); activeTab = tabFromHash(); render(); window.scrollTo({top:0,behavior:'auto'});});
window.addEventListener('online',loadLive);
window.addEventListener('offline',() => {connection = 'offline'; render();});
document.addEventListener('visibilitychange',() => {if (!document.hidden && Date.now() - lastAttempt >= 15 * 60000) loadLive();});
setInterval(() => {if (!document.hidden && Date.now() - lastAttempt >= 15 * 60000) loadLive();},60000);
render(); loadLive();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
