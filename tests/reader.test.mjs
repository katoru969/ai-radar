import test from 'node:test';
import assert from 'node:assert/strict';
import {readerFit,selectToday,normalizePreferences,deduplicateArticles} from '../shared.js';
import {extractJapaneseBody,extractiveSummary,enrichReaderArticles,allowedBodyUrl} from '../lib/reader-summary.mjs';
import {embeddedJson,channelVideoIds,parseWatchPage,collectYouTubeSource} from '../lib/youtube.mjs';
import {parseFeed} from '../lib/feeds.mjs';
import {fetchText} from '../lib/transport.mjs';
import {videoDescription} from '../lib/text.mjs';
import {sanitizeSnapshot} from '../lib/snapshot.mjs';

const now = Date.parse('2026-10-07T12:00:00Z');
const item = (title,overrides = {}) => ({id:title,title,originalTitle:title,originalSummary:'',source:'Test',sourceId:'test',sourceFamily:'Test',sourceType:'official',url:'https://example.com/article',publishedAt:'2026-10-06T12:00:00Z',importanceScore:90,topics:[],...overrides});

test('Reader policy accepts features, pricing, practical instructions and simple setup',() => {
  for (const title of ['ChatGPTの新機能を公開','Claudeの料金プラン変更','Geminiで議事録を作る使い方','NotebookLMで資料を整理する方法','Claude DesktopのMCP設定を初心者向けに解説','ChatGPTとコピペで作るノーコードアプリ']) assert.equal(readerFit(item(title)).eligible,true,title);
  assert.equal(readerFit(item('Claudeの料金プラン変更')).category,'料金・利用条件');
});
test('Reader policy rejects engineering, corporate announcements and description-only promotion',() => {
  for (const title of ['openai-python SDK release v2.0','Gemini APIの料金変更','Claude CodeのCLIアーキテクチャ','ChatGPTとRAGの実装','Geminiのベンチマークを検証','Anthropic announces enterprise partnership','How Example is scaling quant research with ChatGPT','ChatGPTのモデル分業で隠しテスト100%だった','Gemini Nano BananaがGA、gemini-3.1-flash-imageは終了【移行ガイド】','新しいカメラを買いました']) assert.equal(readerFit(item(title,{originalSummary:'ChatGPT・Claude・Geminiの無料講座はこちら'})).eligible,false,title);
  assert.equal(readerFit(item('Geminiの画像生成が進化',{originalSummary:'Gemini APIの画像編集をアプリやバッチ処理に組み込む開発者向けです。'})).eligible,false);
  assert.equal(readerFit(item('Claude、Gemini、GPTが更新',{detailedSummary:'長いコーディングに対応し、Claude Codeのコードレビュー性能とベンチマークを検証します。'})).eligible,false);
});
test('Today filters legacy cached engineering articles and includes a recent useful video',() => {
  const items = Array.from({length:8},(_,index) => item(`ChatGPTの新機能 ${index}`,{id:String(index),sourceFamily:`Official ${index}`}));
  items.push(item('ChatGPTの使い方を解説',{id:'video',sourceType:'youtube',sourceFamily:'Creator',importanceScore:76}));
  items.push(item('Introducing the ChatGPT API',{id:'legacy-sdk',importanceScore:100}));
  const today = selectToday(items,{sources:{},interests:[]},now);
  assert.equal(today.length,5); assert.ok(today.some(article => article.id === 'video')); assert.ok(!today.some(article => article.id === 'legacy-sdk'));
  assert.ok(!selectToday(items,{sources:{youtube:false},interests:[]},now).some(article => article.id === 'video'));
});
test('Today shows four readable articles rather than padding with an English-only item',() => {
  const articles = Array.from({length:4},(_,index) => item(`ChatGPTの機能 ${index}`,{sourceFamily:String(index),summaryBasis:'article'}));
  articles.push(item('New Claude feature',{sourceFamily:'English',summaryBasis:'unavailable',importanceScore:100}));
  const today = selectToday(articles,{sources:{},interests:[]},now);
  assert.equal(today.length,4); assert.ok(today.every(article => article.summaryBasis === 'article'));
});
test('Cross-posted long titles deduplicate across Zenn and Qiita, without merging short release titles',() => {
  const title = '録音から議事録までChatGPTの新しい機能を具体的に活用する方法';
  assert.equal(deduplicateArticles([item(title,{sourceType:'zenn'}),item(title,{source:'Other',sourceFamily:'Other',sourceType:'qiita',url:'https://example.com/crosspost'})]).length,1);
  assert.equal(deduplicateArticles([item('v2.0'),item('v2.0',{sourceFamily:'Other',url:'https://example.com/other'})]).length,2);
});
test('Old interests migrate while saved source switches and learning survive',() => {
  const prefs = normalizePreferences({interests:['AI技術全般','プログラミング','教育'],sources:{youtube:false},understood:['MCP']});
  assert.deepEqual(prefs.interests,['新機能・料金','使い方・設定','調べもの・学習']); assert.equal(prefs.sources.youtube,false); assert.deepEqual(prefs.understood,['MCP']);
});

const paragraphs = [
  'Geminiに資料を読み込ませて、会議で決まった事項や次の作業を整理できる新機能が追加されました。',
  'まずアプリの設定画面を開き、使いたい資料を選択すると、内容に基づいた質問ができます。',
  '無料プランでは一日に利用できる回数に上限があり、有料プランとは対象となる機能が異なります。',
  '日本でも順次提供されますが、すべての利用者へ同時に表示されるわけではありません。',
  '仕事の資料を使う場合は、共有範囲や機密情報が含まれていないかを事前に確認してください。',
  '具体的な活用例として、長い議事録から決定事項と担当者を抽出する手順が紹介されています。'
];
test('Japanese body extraction excludes navigation, scripts and promotional paragraphs',() => {
  const html = `<nav>新機能メニュー</nav><main><h1>Geminiの新機能</h1><article>${paragraphs.map(text => `<p>${text}</p>`).join('')}<p>公式LINEに登録すると無料セミナーに参加できます。</p><script>secret()</script></article></main><footer>ログインはこちら</footer>`;
  const body = extractJapaneseBody(html,'https://blog.google/intl/ja-jp/test/');
  assert.ok(body); assert.ok(body.body.includes(paragraphs[2])); assert.doesNotMatch(body.body,/メニュー|公式LINE|secret|ログイン/);
  assert.equal(extractJapaneseBody(`<nav>${paragraphs.join('')}</nav><article><p>${'This article is only in English. '.repeat(100)}</p></article>`,'https://blog.google/test'),null);
});
test('Overview and substantive summary retain source facts and never create unavailable dates/prices',() => {
  const result = extractiveSummary(paragraphs.join('\n'));
  assert.ok(result.summary.length <= 150); assert.ok(result.detailedSummary.length >= 250); assert.ok(result.detailedSummary.length <= 550);
  assert.match(result.detailedSummary,/無料プラン/); assert.match(result.detailedSummary,/順次提供/); assert.doesNotMatch(result.detailedSummary,/2026|980円|iPhone限定/);
  const absent = extractiveSummary('Only English, with no Japanese text.'); assert.equal(absent,null);
});
test('Video descriptions exclude books, signup links and recommended videos',() => {
  const description = videoDescription(`ChatGPTの新機能を実際の操作画面で説明します。\n▼KEITOの著書\nChatGPT むちゃぶり仕事術\nhttps://example.com/book\n▼目次\n00:00 ChatGPTの新機能と使い方\n02:00 無料プランの上限について説明\n■おすすめ動画\n無関係な動画の紹介です。`);
  assert.match(description,/新機能と使い方/); assert.doesNotMatch(description,/著書|仕事術|https:|無関係/);
});
test('Only trusted HTTPS article hosts are fetched and redirects cannot reach another host',async () => {
  for (const url of ['http://note.com/a','https://localhost/a','https://127.0.0.1/a','https://note.com.evil/a','https://user:pass@note.com/a']) assert.equal(allowedBodyUrl(url),false);
  let requests = 0;
  await assert.rejects(fetchText('https://note.com/test',{validateUrl:allowedBodyUrl,fetchImpl:async () => {requests++; return new Response(null,{status:302,headers:{location:'http://127.0.0.1/admin'}});}}),/unsafe_article_url/);
  assert.equal(requests,1);
});
test('Failed body fetch retains Japanese feed text and does not call a paid provider',async () => {
  let paid = 0;
  const articles = await enrichReaderArticles([item('ChatGPTの使い方',{url:'https://note.com/test/n/test',originalSummary:paragraphs.join('\n')}),item('New Claude features',{url:'https://example.com/test'})],{now,fetchImpl:async url => {if (url.includes('api.openai') || url.includes('googleapis')) paid++; throw new Error('unavailable');}});
  assert.equal(articles[0].summaryBasis,'feed'); assert.ok(articles[0].detailedSummary.length >= 250); assert.equal(articles[1].summaryBasis,'unavailable'); assert.equal(paid,0);
});
test('Unchanged Japanese body summaries reuse the last genuine body check time',async () => {
  const article = item('ChatGPTの使い方',{url:'https://note.com/test/n/test',originalSummary:paragraphs[0]});
  const first = await enrichReaderArticles([article],{now,fetchImpl:async () => new Response(`<article>${paragraphs.map(text => `<p>${text}</p>`).join('')}</article>`)});
  let calls = 0;
  const second = await enrichReaderArticles([article],{now:now + 1000,cache:new Map([[article.id,first[0]]]),fetchImpl:async () => {calls++; throw new Error('must reuse');}});
  assert.equal(calls,0); assert.equal(second[0].summaryBasis,'article'); assert.equal(second[0].bodyCheckedAt,first[0].bodyCheckedAt);
});

const videoId = 'abcdefghijk', channelId = 'UCtestchannel';
const ytSource = {id:'yt',name:'Creator',sourceType:'youtube',channelId,url:`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`};
const player = (overrides = {}) => ({videoDetails:{videoId,channelId,title:'ChatGPTの新機能と使い方',shortDescription:paragraphs.join('\n')},microformat:{playerMicroformatRenderer:{publishDate:'2026-10-06T12:00:00+09:00'}},...overrides});
const watchHtml = data => `<script>var ytInitialPlayerResponse = ${JSON.stringify(data)};</script>`;
const channelHtml = renderer => `<script>var ytInitialData = ${JSON.stringify({contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{content:{richGridRenderer:{contents:[renderer]}}}}]}}})};</script>`;
test('Embedded JSON parses quoted braces safely and channel grids support old and new formats',() => {
  assert.deepEqual(embeddedJson('<script>var ytInitialData = {"text":"a } \\"{ ","nested":{"ok":true}};</script>','ytInitialData').nested,{ok:true});
  assert.deepEqual(channelVideoIds(channelHtml({videoRenderer:{videoId}})),[videoId]);
  assert.deepEqual(channelVideoIds(channelHtml({richItemRenderer:{content:{lockupViewModel:{contentType:'LOCKUP_CONTENT_TYPE_VIDEO',contentId:videoId}}}})),[videoId]);
  assert.throws(() => channelVideoIds('<h1>Sign in</h1>'),/youtube_page_changed/);
});
test('Watch metadata uses genuine publication date and rejects other channels or missing/future dates',() => {
  assert.equal(parseWatchPage(watchHtml(player()),videoId,ytSource,now).publishedAt,'2026-10-06T03:00:00.000Z');
  assert.equal(parseWatchPage(watchHtml(player({videoDetails:{...player().videoDetails,channelId:'UCother'}})),videoId,ytSource,now),null);
  for (const date of ['', '2026-10-08T12:00:00Z']) assert.equal(parseWatchPage(watchHtml(player({microformat:{playerMicroformatRenderer:{publishDate:date}}})),videoId,ytSource,now),null);
});
test('YouTube retries transient RSS failure before returning actual feed data',async () => {
  let calls = 0;
  const rss = `<feed><entry><title>ChatGPTの新機能</title><link href="https://www.youtube.com/watch?v=${videoId}"/><published>2026-10-06T12:00:00Z</published></entry></feed>`;
  const result = await collectYouTubeSource(ytSource,{parseFeed,now,fetchImpl:async () => ++calls === 1 ? new Response(null,{status:500}) : new Response(rss)});
  assert.equal(calls,2); assert.equal(result.articles.length,1); assert.equal(result.retrievalMethod,'youtube-rss');
});
test('Persistent RSS error recovers using public pages without a key, authentication or invented dates',async () => {
  const urls = [];
  const result = await collectYouTubeSource(ytSource,{parseFeed,now,fetchImpl:async (url,options) => {
    urls.push(url); assert.equal(options.headers.authorization,undefined);
    if (url.includes('/feeds/')) return new Response(null,{status:500});
    return new Response(url.includes('/watch?') ? watchHtml(player()) : channelHtml({videoRenderer:{videoId}}));
  }});
  assert.equal(urls.filter(url => url.includes('/feeds/')).length,3); assert.equal(result.articles.length,1); assert.equal(result.retrievalMethod,'youtube-page'); assert.equal(result.recoveryReason,'http_500'); assert.equal(result.articles[0].publishedAt,'2026-10-06T03:00:00.000Z');
});
test('Published snapshot preserves detailed summary and safe diagnostics while dropping body and secrets',() => {
  const snapshot = sanitizeSnapshot({articles:[{...item('ChatGPTの新機能'),detailedSummary:paragraphs.join(''),summaryBasis:'article',summaryState:'ready',summaryMode:'extractive',body: 'private body should not be published',apiKey:'private secret'}],sources:[{id:'yt',name:'Creator',sourceType:'youtube',status:'ok',count:1,retrievalMethod:'youtube-page',recoveryReason:'http_500',error:'secret token'}]});
  assert.ok(snapshot.articles[0].detailedSummary.length >= 250); assert.equal(snapshot.articles[0].summaryBasis,'article'); assert.equal(snapshot.sources[0].recoveryReason,'http_500'); assert.equal(snapshot.sources[0].error,''); assert.doesNotMatch(JSON.stringify(snapshot),/private|secret token/);
});
