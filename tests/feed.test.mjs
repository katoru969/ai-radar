import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFeed, parseAnthropic, collectSources, fetchText} from '../lib/feeds.mjs';
import {createArticle, topicData} from '../lib/articles.mjs';
import {canonicalUrl, deduplicateArticles, selectToday} from '../shared.js';
import {summarizeArticles} from '../lib/summarizer.mjs';

const now = Date.parse('2026-10-06T12:00:00Z');
const source = {id:'test',name:'Official',family:'Official',sourceType:'official',url:'https://example.com/news'};
const rss = `<rss version="2.0"><channel><item><title><![CDATA[Introducing Test AI &amp; Tools]]></title><link>https://example.com/post?utm_source=test</link><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>API &amp; Agent news</p><script>bad()</script>]]></description></item></channel></rss>`;
const article = (overrides = {}) => createArticle({title:'Introducing ChatGPT Agent',url:'https://example.com/post',date:'2026-10-05T10:00:00Z',description:'New ChatGPT features and Agent tools',source,...overrides},now);

test('RSS: CDATA, HTML, entities, date and common Article fields are normalized',() => {
  const [item] = parseFeed(rss,source,now);
  assert.equal(item.url,'https://example.com/post');
  assert.equal(item.publishedAt,'2026-10-05T10:00:00.000Z');
  assert.equal(item.originalSummary,'API & Agent news');
  for (const key of ['id','title','source','sourceType','url','publishedAt','summary','importanceScore','importanceGrade','whyImportant','personalRelevance','terms','thumbnail']) assert.ok(Object.hasOwn(item,key),key);
  assert.ok(item.terms.includes('Agent'));
  assert.match(item.summary,/[ぁ-ん一-龯]/);
});
test('Atom: choose HTML alternate rather than self link, and read namespaced YouTube media',() => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><entry><title>New Codex CLI</title><link rel="self" href="https://example.com/feed.xml"/><link rel="alternate" type="text/html" href="https://example.com/video"/><published>2026-10-05T10:00:00Z</published><media:group><media:description>Agent demo</media:description><media:thumbnail url="https://example.com/thumb.jpg"/></media:group></entry></feed>`;
  const [item] = parseFeed(atom,{...source,sourceType:'youtube'},now);
  assert.equal(item.url,'https://example.com/video');
  assert.equal(item.thumbnail,'https://example.com/thumb.jpg');
  assert.equal(item.originalSummary,'Agent demo');
});
test('Invalid, HTML and entity-expanding documents fail only that source',() => {
  for (const xml of ['<html><body>Not a feed</body></html>','<rss><channel>',`<!DOCTYPE rss [<!ENTITY a "evil">]><rss><channel/></rss>`]) assert.throws(() => parseFeed(xml,source,now));
});
test('Missing/invalid/future dates and unsafe article URLs are never invented as fresh news',() => {
  for (const date of ['', 'invalid','2026-10-07T10:00:00Z']) assert.equal(article({date}),null);
  assert.equal(article({url:'javascript:alert(1)'}),null);
  assert.equal(article({source:{...source,aiOnly:true},title:'A recipe',description:'Dinner today'}),null);
});
test('Anthropic: title and actual time from newsroom, detect structural breakage',() => {
  const html = `<a href="/news/test"><time>Oct 2, 2026</time><span class="publication__title">Introducing Test AI</span></a>`;
  assert.equal(parseAnthropic(html,source,now)[0].publishedAt,'2026-10-02T00:00:00.000Z');
  assert.equal(parseAnthropic(html,source,now)[0].publishedAtPrecision,'day');
  assert.throws(() => parseAnthropic('<h1>Changed</h1>',source,now));
});
test('Related terms match concepts without treating client as CLI',() => {
  assert.ok(!topicData('Improve client experience').terms.includes('API'));
  assert.ok(!topicData('Improve client experience').topics.includes('プログラミング'));
  assert.ok(topicData('Model guide and reasoning effort').terms.includes('Inference'));
  assert.ok(!topicData('Cyber Verification Program').topics.includes('プログラミング'));
});
test('Japanese guides explain announcement, expansion and case-study headlines without adding facts',() => {
  const video = article({title:'Introducing the Decisions API',source:{...source,sourceType:'youtube'}});
  assert.match(video.title,/Decisions APIを紹介/); assert.match(video.summary,/公式動画/);
  const expanded = article({title:'Expanding the Cyber Verification Program'});
  assert.match(expanded.title,/サイバー検証プログラムを拡大/);
  const example = article({title:'How Example is scaling quant research with ChatGPT'});
  assert.match(example.title,/定量研究の事例/); assert.match(example.summary,/ChatGPTを使って定量研究を拡大/);
  const japanese = article({title:'MCPを業務へ導入する',description:'こんにちは、著者です。「なるほど」と思う。MCPを使って外部のデータをAIへ渡す接続方法を、実際のコードとともに説明します。',source:{...source,sourceType:'zenn'}});
  assert.equal(japanese.summary,'MCPを使って外部のデータをAIへ渡す接続方法を、実際のコードとともに説明します。');
});
test('Deduplicate tracking URLs and title variants from the same publisher; IDs stay stable',() => {
  const a = article(), b = article({url:'https://example.com/post/?utm_medium=email#section'}), c = article({url:'https://example.com/other'});
  assert.equal(a.id,b.id);
  assert.equal(deduplicateArticles([a,b,c]).length,1);
  assert.equal(canonicalUrl('https://example.com/post?b=2&a=1&utm_source=x#hash'),'https://example.com/post?a=1&b=2');
});
test('Partial source failure leaves successful articles usable and can recover saved source data',async () => {
  const previous = new Map();
  const config = {rss:[source,{...source,id:'broken',name:'Broken',url:'https://example.com/broken'}]};
  const result = await collectSources(config,{now,previous,fetchImpl:async url => url.endsWith('broken') ? new Response('down',{status:503}) : new Response(rss)});
  assert.equal(result.articles.length,1); assert.equal(result.sources[1].status,'error');
  const failed = await collectSources(config,{now:now + 1000,previous,fetchImpl:async () => {throw new Error('network');}});
  assert.equal(failed.sources[0].status,'cached'); assert.equal(failed.articles.length,1);
  const expired = await collectSources(config,{now:now + 86400001,previous,fetchImpl:async () => {throw new Error('network');}});
  assert.equal(expired.articles.length,0);
});
test('Timeout cannot keep a feed request pending indefinitely',async () => {
  const fetchImpl = (_,options) => new Promise((resolve,reject) => options.signal.addEventListener('abort',() => reject(new Error('timeout')),{once:true}));
  const keepAlive = setTimeout(() => {},100);
  try {await assert.rejects(() => fetchText(source.url,{fetchImpl,timeoutMs:10}),/timeout/);} finally {clearTimeout(keepAlive);}
});
test('Today: up to ten useful recent articles, source switches, publisher variety and no SDK releases',() => {
  const items = Array.from({length:8},(_,index) => ({...article({url:`https://example.com/${index}`}), id:String(index),source:`Source ${index}`,sourceFamily:`Family ${index}`,importanceScore:80 + index}));
  items.push({...items[0],id:'old',importanceScore:100,publishedAt:'2026-08-01T00:00:00Z'});
  items.push({...items[0],id:'new-release',originalTitle:'openai-python SDK release v2',sourceType:'github',source:'sdk',sourceFamily:'sdk',importanceScore:90});
  items.push({...items[0],id:'old-release',originalTitle:'openai-python SDK release v1',sourceType:'github',source:'sdk',sourceFamily:'sdk',importanceScore:99,publishedAt:'2026-10-03T00:00:00Z'});
  const selected = selectToday(items,{sources:{},interests:[]},now);
  assert.equal(selected.length,8); assert.ok(!selected.some(item => ['old','old-release'].includes(item.id)));
  assert.ok(!selected.some(item => item.id === 'new-release'));
  assert.ok(selectToday(items,{sources:{official:false,github:false},interests:[]},now).length === 0);
  assert.ok(selectToday(items.slice(0,2),{sources:{},interests:[]},now).length === 2);
});
test('AI provider is opt-in, failures/refusals/malformed JSON preserve every original article',async () => {
  const articles = [article()], env = {SUMMARIZER:'openai',OPENAI_API_KEY:'test-key',OPENAI_MODEL:'test-model'};
  let requests = 0;
  await summarizeArticles(articles,{env:{},fetchImpl:async () => {requests++;}});
  assert.equal(requests,0);
  for (const fetchImpl of [async () => new Response('',{status:429}),async () => new Response(JSON.stringify({output_text:'not json'})),async () => {throw new Error('timeout');}]) {
    const result = await summarizeArticles(articles,{env,fetchImpl,now}); assert.deepEqual(result.articles,articles); assert.equal(result.state,'fallback');
  }
});
test('Structured summary keeps source URL/date/ID intact and ignores unknown IDs',async () => {
  const original = article(), edits = [{id:original.id,title:'日本語の見出し',summary:'日本語の要約',whyImportant:'重要な理由',personalRelevance:'活用のヒント',importanceScore:200,terms:['API','Unknown'],url:'https://evil.example'}, {id:'unknown',title:'Ignore'}];
  const result = await summarizeArticles([original],{now,env:{SUMMARIZER:'openai',OPENAI_API_KEY:'test-key',OPENAI_MODEL:'test-model'},fetchImpl:async (url,options) => {
    const request = JSON.parse(options.body); assert.equal(request.text.format.type,'json_schema'); assert.equal(request.store,false);
    return new Response(JSON.stringify({output_text:JSON.stringify({articles:edits})}));
  }});
  const updated = result.articles[0];
  assert.equal(updated.url,original.url); assert.equal(updated.publishedAt,original.publishedAt); assert.equal(updated.id,original.id);
  assert.equal(updated.importanceScore,100); assert.deepEqual(updated.terms,['API']); assert.equal(updated.summaryMode,'openai');
});
