import {INTERESTS,SOURCE_TYPES,SOURCE_LABELS,SOCIAL_TYPES,TERM_NAMES,GRADE_LABELS,safeUrl,gradeFor,readerFit,selectToday,normalizePreferences} from './shared.js';
import {TERMS} from './terms.js';

const PREFS_KEY = 'ai-radar-prefs', FEED_KEY = 'ai-radar-feed-v1';
const labels = SOURCE_LABELS;
const FEED_PATH = document.querySelector('meta[name="ai-radar-feed"]')?.content || './api/feed';
const STATIC_FEED = FEED_PATH.endsWith('feed.json');
const app = document.getElementById('app'), sheet = document.getElementById('sheet'), detail = document.getElementById('detail'), panel = document.getElementById('panel'), nav = document.querySelector('.bottom-nav');
let prefs = loadPrefs(), activeTab = tabFromHash(), exploreFilter = 'all', exploreSearch = '', learnFilter = 'all';
let exploreFilterScroll = 0;
let feed = loadCachedFeed(), loading = false, connection = feed.articles.length ? 'cached' : 'initial', lastAttempt = 0;
let returnFocus = null, backArticleId = null, toastTimer;

function readStorage(key) {try {return JSON.parse(localStorage.getItem(key) || 'null');} catch {return null;}}
function writeStorage(key, value) {try {localStorage.setItem(key,JSON.stringify(value)); return true;} catch {return false;}}
function loadPrefs() {
  return normalizePreferences(readStorage(PREFS_KEY));
}
function savePrefs() {if (!writeStorage(PREFS_KEY,{...prefs,version:3})) toast('このブラウザでは設定を保存できません');}
function normalizeArticle(item) {
  if (!item || !SOURCE_TYPES.includes(item.sourceType) || !safeUrl(item.url) || !item.id || !Number.isFinite(Date.parse(item.publishedAt))) return null;
  const score = Math.max(0,Math.min(100,Number(item.importanceScore) || 0));
  const text = name => typeof item[name] === 'string' ? item[name] : '';
  item = {...item,detailedSummary:text('detailedSummary'),bodyUrl:safeUrl(text('bodyUrl'))};
  return {...item, id:String(item.id), title:text('title'), source:text('source'), summary:text('summary'), whyImportant:text('whyImportant'), personalRelevance:text('personalRelevance'), originalTitle:text('originalTitle'), originalSummary:text('originalSummary'), url:safeUrl(item.url), linkedUrl:safeUrl(item.linkedUrl), discussionUrl:safeUrl(item.discussionUrl), thumbnail:safeUrl(item.thumbnail), importanceScore:score, importanceGrade:gradeFor(score), terms:Array.isArray(item.terms) ? [...new Set(item.terms.filter(term => TERM_NAMES.includes(term)))] : [], topics:Array.isArray(item.topics) ? item.topics.filter(topic => INTERESTS.includes(topic)) : []};
}
function normalizeFeed(data) {
  return {articles:Array.isArray(data?.articles) ? data.articles.slice(0,100).map(normalizeArticle).filter(Boolean) : [], sources:Array.isArray(data?.sources) ? data.sources.filter(source => source && SOURCE_TYPES.includes(source.sourceType)).map(source => ({...source, count:Math.max(0,Number(source.count) || 0)})) : [], generatedAt:Number.isFinite(Date.parse(data?.generatedAt)) ? data.generatedAt : null, refreshAfter:15 * 60000, summary:data?.summary || {mode:'rules'}};
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
  return `<header><div class="brand"><div class="logo" aria-hidden="true">〰</div><div><h1>${title}</h1><div class="sub">${subtitle}</div></div></div><button class="iconbtn" data-action="sync" aria-label="ニュースを更新" ${loading ? 'disabled' : ''}><span class="${loading ? 'spinning' : ''}">↻</span></button></header>`;
}
function statusText() {
  if (loading) return feed.articles.length ? '保存済み記事を表示・更新中…' : '最新情報を集めています…';
  if (connection === 'offline') return feed.articles.length ? 'オフライン・保存済み記事' : 'オフライン・接続すると取得できます';
  if (connection === 'error') return feed.articles.length ? '取得できませんでした・保存済み記事' : '取得できませんでした・もう一度更新';
  if (connection === 'cached') return '保存済み記事・更新を待っています';
  if (!feed.articles.length) return '記事を取得できませんでした';
  const ok = feed.sources.filter(source => ['ok','empty','partial'].includes(source.status)).length;
  if (STATIC_FEED && Date.now() - Date.parse(feed.generatedAt) > 26 * 3600000) return `最終収集 ${Math.floor((Date.now() - Date.parse(feed.generatedAt)) / 3600000)}時間前・公開済み記事`;
  const clock = new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(new Date(feed.generatedAt));
  return `${ok}/${feed.sources.length}${STATIC_FEED ? '情報源・収集' : '接続・更新'} ${clock}`;
}
function statusStrip() {
  const live = connection === 'live' && feed.sources.every(source => ['ok','empty'].includes(source.status));
  return `<div class="status-strip" role="status" aria-live="polite"><span class="status-dot ${live ? 'live' : ''}" aria-hidden="true"></span><span class="status-copy">${esc(statusText())}</span><button class="sync" data-action="sync" ${loading ? 'disabled' : ''}>${loading ? '取得中' : '更新'}</button></div>`;
}
function sourceIsCached(article) {return connection !== 'live' || feed.sources.some(source => source.id === article.sourceId && source.status === 'cached');}
function visibleArticles() {return feed.articles.filter(article => prefs.sources[article.sourceType] && readerFit(article).eligible);}
function emptyState(message, retry = false) {
  return `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">〰</div><p>${esc(message)}</p>${retry ? '<button class="secondary" data-action="sync">もう一度取得する</button>' : '<button class="secondary" data-action="settings">情報源を確認する</button>'}</div>`;
}
function newsCard(article) {
  return `<article class="card importance-${article.importanceGrade.toLowerCase()}" data-article-id="${esc(article.id)}"><button class="article-open" data-news-id="${esc(article.id)}" aria-label="${esc(article.title)}の詳細を読む"><div class="badge">${gradeBadge(article)}<div class="source-meta"><span class="source">${esc(article.source)}</span><span class="ago">${sourceIsCached(article) ? '保存済み · ' : ''}${timeLabel(article.publishedAt)}</span></div></div><h3 class="title">${esc(article.title)}</h3><p class="summary">${esc(article.summary)}</p></button><div class="article-footer"><div class="tags">${article.terms.slice(0,2).map(term => `<button class="tag" data-term="${esc(term)}" data-back-id="${esc(article.id)}">${esc(term)}</button>`).join('')}</div><button class="text-btn" data-news-id="${esc(article.id)}">詳しく <span aria-hidden="true">›</span></button></div></article>`;
}
function gradeBadge(article) {return `<span class="priority-mark"><span class="grade ${article.importanceGrade.toLowerCase()}">${article.importanceGrade}</span><span class="grade-label">${GRADE_LABELS[article.importanceGrade]}</span></span>`;}
function sourceErrorLabel(source) {
  if (/^http_\d{3}$/.test(source.error || '')) return `配信元がエラーを返しました（${source.error.slice(5)}）`;
  return {timeout:'配信元の応答待ちで時間切れ',connection_reset:'配信元との通信が途中で切れました',dns_error:'配信元の接続先を確認できませんでした',youtube_page_changed:'動画一覧を読み取れませんでした',youtube_metadata_missing:'動画の公開情報を取得できませんでした',anthropic_page_changed:'公式ページの形式が変わっています'}[source.error] || '配信元に接続できませんでした';
}
function sourceStateHtml(source) {
  const label = {ok:`${source.count}件取得`,empty:'新着なし',error:'取得失敗',cached:'保存分を表示',partial:`${source.count}件・一部取得失敗`}[source.status] || '確認中';
  return `${label}${source.error ? `<small>${esc(sourceErrorLabel(source))}</small>` : source.recoveryReason ? `<small>RSSの配信エラーから復旧・${source.retrievalMethod === 'youtube-page' ? '公開ページで取得' : '再取得に成功'}</small>` : ''}${source.feedError ? `<small>RSS：${esc(sourceErrorLabel({error:source.feedError}))}</small>` : ''}${source.cachedCount ? `<small>うち${source.cachedCount}件は保存分・${esc(fullDate(source.cachedFetchedAt))}</small>` : ''}`;
}
function renderToday() {
  const top = selectToday(feed.articles,prefs);
  const date = new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date());
  const failed = feed.sources.filter(source => ['error','cached','partial'].includes(source.status));
  app.innerHTML = `${header()}<div class="meta"><span>${date}</span><span>約1〜2分でチェック</span></div><section class="hero"><h2>今日の重要ニュース</h2><p>いつものAIに、新しくできること。<br>新機能・料金・使い方を中心に最大5件。</p></section>${statusStrip()}${failed.length ? `<p class="notice">${esc(failed.map(source => source.name).join('・'))}の一部を取得できませんでした。Settingsで状態を確認できます。</p>` : ''}<div class="digest-label"><span>${top.length ? `${top.length}件をピックアップ` : '最新のダイジェスト'}</span><button class="text-btn" data-action="about">A / B / C の見方</button></div><div id="cards">${top.length ? top.map(newsCard).join('') : loading ? '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' : emptyState(feed.articles.length ? '選んだ情報源に、直近30日の活用記事がありません。' : '最新記事を取得すると、ここに表示されます。',!feed.articles.length)}</div>${top.length ? `<div class="digest-end"><b>今日はここまで。</b><span>気になるニュースは、タップしてもう少し詳しく。</span><button class="secondary" data-action="explore">Exploreですべて見る <span aria-hidden="true">›</span></button></div>` : ''}<p class="footnote">日本語本文・説明文から要点を抽出しています。<br>公開日・投稿日時を表示しています。当日公開の記事に限りません。</p>`;
}
function exploredArticles() {
  const query = exploreSearch.trim().toLocaleLowerCase();
  return visibleArticles().filter(article => (exploreFilter === 'all' || article.sourceType === exploreFilter) && (!query || `${article.title} ${article.originalTitle} ${article.summary} ${article.source} ${article.terms.join(' ')}`.toLocaleLowerCase().includes(query))).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
function exploreResults() {
  const articles = exploredArticles();
  return articles.length ? articles.map(article => `<button class="feed-item importance-${article.importanceGrade.toLowerCase()}" data-news-id="${esc(article.id)}"><div class="feed-top">${gradeBadge(article)}<div class="source-meta"><b class="source">${esc(article.source)}</b><span class="ago">${timeLabel(article.publishedAt)}</span></div></div><div class="feed-title">${esc(article.title)}</div><p class="summary">${esc(article.summary)}</p><div class="feed-bottom"><span class="tag">${labels[article.sourceType]}</span><span class="mini-grade">${esc(article.readerCategory || readerFit(article).category)}</span></div></button>`).join('') : `<div class="empty">${exploreFilter !== 'all' && !prefs.sources[exploreFilter] ? 'この情報源はOFFです。SettingsでONにできます。' : loading ? '記事を取得しています…' : exploreFilter === 'github' ? '開発者向けSDKの収集は停止しています。' : '該当する活用記事がありません。'}</div>`;
}
function renderExplore() {
  const previousBar = app.querySelector('[aria-label="情報源フィルター"]');
  if (previousBar) exploreFilterScroll = previousBar.scrollLeft;
  app.innerHTML = `${header('Explore','気になる情報を、もう少し詳しく')}<label class="sr-only" for="exploreSearch">ニュースを検索</label><input class="searchbox" id="exploreSearch" type="search" placeholder="ニュース・用語を検索" value="${esc(exploreSearch)}" autocomplete="off"><div class="filter-bar" aria-label="情報源フィルター">${['all',...SOURCE_TYPES].map(type => `<button class="chip ${exploreFilter === type ? 'active' : ''}" data-filter="${type}" aria-pressed="${exploreFilter === type}">${type === 'all' ? 'All' : labels[type]}</button>`).join('')}</div>${statusStrip()}<div class="section-title"><h2 class="list-heading">新着の記事</h2><span id="resultCount">${exploredArticles().length}件</span></div><div id="exploreResults">${exploreResults()}</div>`;
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
  const descriptions = {official:'ChatGPT・Claude・Geminiなどの機能・料金',youtube:'OpenAI公式・mikimiki・KEITOの新着動画',note:'noteのAI活用・新機能',github:'SDK収集は停止中（設定は保存できます）',zenn:'ChatGPT・Geminiの使い方・設定',qiita:'ChatGPT・Geminiの実用的な解説',bluesky:'公開投稿から個人で使える情報を選別',hackernews:'海外の話題からAIの活用情報を選別',mastodon:'公開投稿から個人で使える情報を選別'};
  app.innerHTML = `${header('Settings','自分に合うレーダーに')}<section class="settings-group"><h2>興味のある分野</h2><p class="hint">新機能・料金・具体的な使い方を優先します。Todayの並び順に反映します。</p><div class="chips">${INTERESTS.map(interest => `<button class="chip ${prefs.interests.includes(interest) ? 'active' : ''}" data-interest="${esc(interest)}" aria-pressed="${prefs.interests.includes(interest)}">${esc(interest)}</button>`).join('')}</div></section><section class="settings-group"><h2>情報源</h2><p class="hint">ONにした情報源をTodayとExploreに表示します。</p><div class="toggle-wrap">${SOURCE_TYPES.map(type => switchRow('source',type,prefs.sources[type],labels[type],descriptions[type])).join('')}</div></section><section class="settings-group"><h2>通知の希望</h2><p class="hint">設定を保存できます。通知の配信機能は準備中です。</p><div class="toggle-wrap">${switchRow('notification','important',prefs.notifications.important,'重要ニュース','重要度Aのニュースをお知らせ')}${switchRow('notification','digest',prefs.notifications.digest,'朝のダイジェスト','毎日のまとめをお知らせ')}</div></section><section class="settings-group"><h2>取得状況</h2><div class="tiny-note"><span class="status-dot ${connection === 'live' ? 'live' : ''}"></span> ${esc(statusText())}<br><span>最終収集 ${esc(fullDate(feed.generatedAt))}</span><details><summary>情報源ごとの状態</summary>${feed.sources.length ? feed.sources.map(source => `<div class="source-status"><span>${esc(source.name)}</span><span class="${['error','cached','partial'].includes(source.status) ? 'status-warning' : ''}">${sourceStateHtml(source)}</span></div>`).join('') : '<p>まだ取得していません。</p>'}</details></div><button class="secondary" data-action="sync" ${loading ? 'disabled' : ''}>${loading ? '更新しています…' : 'ニュースを更新する'}</button></section><section class="settings-group"><h2>iPhoneで使う</h2><button class="secondary" data-action="install">ホーム画面に追加する方法 <span aria-hidden="true">›</span></button></section><section class="settings-group"><button class="secondary" data-action="reset-learning">学習状況をリセット</button><p class="footnote">学習状況・設定はこの端末に保存されます。<br>AI Radar · Version 1.2 · 無料の本文抜粋まとめ</p></section>`;
}
function render() {
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
function openNews(id) {
  const article = feed.articles.find(item => item.id === id);
  if (!article) return;
  backArticleId = null;
  const posted = SOCIAL_TYPES.includes(article.sourceType);
  const sourceLabel = article.source.includes(labels[article.sourceType]) ? article.source : `${article.source} · ${labels[article.sourceType]}`;
  const link = (url,label) => `<a class="source-link secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`;
  const relatedLinks = [article.linkedUrl && article.linkedUrl !== article.url ? link(article.linkedUrl,'共有された記事を読む') : '',article.discussionUrl && article.discussionUrl !== article.url ? link(article.discussionUrl,'Hacker Newsの議論を見る') : ''].join('');
  const basisLabel = {article:'日本語の記事本文から抽出',feed:'日本語の配信抜粋から抽出', 'video-description':'動画の日本語説明文から抽出（映像・字幕は未確認）',unavailable:'日本語の本文を確認できていません'}[article.summaryBasis] || '日本語の本文を確認できていません';
  detail.innerHTML = `<div class="badge">${gradeBadge(article)}<span class="source">${esc(sourceLabel)}</span></div>
    <h2 id="detailTitle">${esc(article.title)}</h2><p class="detail-meta">${posted ? '投稿' : '公開'} ${esc(fullDate(article.publishedAt,article.publishedAtPrecision))}${sourceIsCached(article) ? ' · 保存済み記事' : ''}</p>
    <div class="explain blue"><h3>要点</h3><p>${esc(article.summary)}</p></div><div class="explain lilac"><h3>なぜ重要か</h3><p>${esc(article.whyImportant)}</p></div><div class="explain mint"><h3>自分にどう関係するか</h3><p>${esc(personalHint(article))}</p></div>
    <div class="explain long-summary"><h3>詳しいまとめ</h3>${article.detailedSummary ? `<p>${esc(article.detailedSummary)}</p>` : '<p>日本語の本文・説明文を取得できなかったため、詳しいまとめはまだありません。原文で内容を確認できます。</p>'}<span class="summary-basis">${esc(basisLabel)}${article.detailedSummary && article.summaryState === 'limited' ? '。取得できた文章が短いため、まとめも短めです。' : ''}</span></div>
    <h3 class="related-heading">関連AI用語</h3><div class="tags">${article.terms.map(term => `<button class="tag" data-term="${esc(term)}" data-back-id="${esc(article.id)}">${esc(term)}</button>`).join('') || '<span class="sub">この記事に関連する用語はありません。</span>'}</div>
    <details class="original"><summary>原題・フィードの抜粋</summary><b>${esc(article.originalTitle)}</b>${article.originalSummary ? `<p>${esc(article.originalSummary.slice(0,700))}</p>` : '<p>この情報源には本文の抜粋がありません。</p>'}</details>
    <p class="footnote">活用のヒント・重要度は編集上の目安です。${posted ? '<br>表示日は投稿日時です。共有された記事の公開日とは異なる場合があります。' : ''}</p>
    ${article.bodyUrl && article.bodyUrl !== article.url ? link(article.bodyUrl,'日本語の本文を読む') : ''}${link(article.url,article.sourceType === 'youtube' ? '動画を見る' : ['bluesky','mastodon'].includes(article.sourceType) ? '投稿を読む' : '原文を読む')}${relatedLinks}`;
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
  detail.innerHTML = type === 'install' ? '<h2 id="detailTitle">ホーム画面から、毎日。</h2><div class="explain blue"><h3>iPhoneのSafariで開く</h3><p>公開したAI RadarのURLをSafariで開きます。</p></div><div class="explain lilac"><h3>共有からホーム画面へ</h3><p>Safariの共有メニューを開き、「ホーム画面に追加」を選んで追加します。</p></div><div class="explain mint"><h3>次からはアイコンをタップ</h3><p>ニュースは開いたときに更新します。通信できないときも、前回取得した記事と用語集を確認できます。</p></div>' : '<h2 id="detailTitle">ニュースの読み方</h2><div class="explain lilac"><h3>A · まずチェック</h3><p>使っているAIの新機能・料金変更など、先に確認したい情報（85点以上）。</p></div><div class="explain blue"><h3>B · 試す候補</h3><p>自分の用途に合えば試せる使い方・設定（72〜84点）。</p></div><div class="explain mint"><h3>C · 参考情報</h3><p>個人の使用例や周辺情報。時間があるときの参考に（71点以下）。</p></div><p class="footnote">重要度は情報源・内容・公開日の新しさから算出する目安です。Todayは直近7日を優先し、少ない場合は30日まで広げます。日本語本文・説明文から抽出した要点と、詳しいまとめを表示します。日本語本文がない場合は、確認できた範囲を明記します。</p>';
  openSheet();
}
function toast(message) {
  const element = document.getElementById('toast');
  clearTimeout(toastTimer); element.textContent = message; element.classList.add('show');
  toastTimer = setTimeout(() => element.classList.remove('show'),2200);
}
async function loadLive() {
  if (loading) return;
  lastAttempt = Date.now();
  if (!navigator.onLine) {connection = 'offline'; render(); return;}
  loading = true; render();
  try {
    const response = await fetch(new URL(FEED_PATH,document.baseURI),{cache:'no-store',signal:AbortSignal.timeout(40000)});
    if (!response.ok) throw new Error('feed_failed');
    const next = normalizeFeed(await response.json());
    if (!next.articles.length) {
      if (feed.articles.length) feed = {...feed,sources:next.sources};
      else feed = next;
      connection = 'error';
    } else {
      feed = next;
      connection = response.headers.get('X-AI-Radar-Cached') === '1' ? 'cached' : next.sources.some(source => ['ok','empty','partial'].includes(source.status)) ? 'live' : 'error';
      writeStorage(FEED_KEY,next);
    }
  } catch {connection = navigator.onLine ? 'error' : 'offline';}
  finally {loading = false; render();}
}
function handleClick(event) {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.newsId) return openNews(button.dataset.newsId);
  if (button.dataset.term) return openTerm(button.dataset.term,button.dataset.backId || null);
  if (button.dataset.filter) {exploreFilter = button.dataset.filter; renderExplore(); return;}
  if (button.dataset.learnFilter) {learnFilter = button.dataset.learnFilter; renderLearn(); return;}
  if (button.dataset.understand) {
    const term = button.dataset.understand, wasDone = prefs.understood.includes(term), articleId = backArticleId;
    prefs.understood = wasDone ? prefs.understood.filter(value => value !== term) : [...new Set([...prefs.understood,term])];
    savePrefs(); render(); openTerm(term,articleId); toast(wasDone ? '未学習に戻しました' : '理解済みにしました'); return;
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
  if (action === 'sync') loadLive();
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
sheet.addEventListener('keydown',event => {
  if (event.key === 'Escape') {event.preventDefault(); closeSheet();}
  if (event.key !== 'Tab') return;
  const focusable = [...panel.querySelectorAll('button:not([disabled]),a[href],summary,input')];
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
