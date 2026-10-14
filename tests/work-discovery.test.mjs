import test from 'node:test';
import assert from 'node:assert/strict';
import {todayGradeCounts,workDiscoveryPriority,evaluateImportance,applyTodayGrades} from '../importance.js';
import {selectToday,normalizePreferences,readerFit,limitFeedArticles} from '../shared.js';
import {configuredSources,parseFeed} from '../lib/feeds.mjs';
import {enrichReaderArticles} from '../lib/reader-summary.mjs';

const now=Date.parse('2026-10-14T06:00:00Z');
const item=(id,score,overrides={})=>({id,title:'ChatGPTで資料を整理する方法',originalTitle:'ChatGPTで資料を整理する方法',source:'Example',sourceId:'example',sourceFamily:id,sourceType:'note',url:`https://note.com/author/n/${id}`,publishedAt:'2026-10-13T06:00:00Z',importanceScore:score,importanceGrade:score>=85?'A':score>=60?'B':'C',summaryBasis:'article',detailedSummary:'資料を添付して出力の形式を指定します。'.repeat(10),topics:[],...overrides});
const prefs=normalizePreferences();

test('The presentation target is two A, five B, three C, with nearest whole counts on short days',()=>{
  assert.deepEqual(todayGradeCounts(10),{A:2,B:5,C:3});
  assert.deepEqual(todayGradeCounts(0),{A:0,B:0,C:0});
  for(let total=1;total<10;total++)assert.equal(Object.values(todayGradeCounts(total)).reduce((a,b)=>a+b,0),total);
});

test('Today selects the desired mix from qualified candidates without changing their scores or grades',()=>{
  const items=[...Array.from({length:5},(_,i)=>item(`a${i}`,95-i)),...Array.from({length:9},(_,i)=>item(`b${i}`,80-i)),...Array.from({length:6},(_,i)=>item(`c${i}`,55-i))];
  const original=structuredClone(items),today=selectToday(items,prefs,now);
  assert.deepEqual(Object.fromEntries(['A','B','C'].map(g=>[g,today.filter(a=>a.importanceGrade===g).length])),{A:2,B:5,C:3});
  assert.deepEqual(today.filter(a=>a.importanceGrade==='A').map(a=>a.id),['a0','a1']);
  assert.deepEqual(items,original);
  for(const a of today){assert.equal(a.importanceScore,original.find(value=>value.id===a.id).importanceScore);assert.equal(a.importanceGrade,original.find(value=>value.id===a.id).importanceGrade);}
});

test('A shortages are disclosed by real counts, and understanding an A does not manufacture a replacement',()=>{
  const items=[item('only-a',93),...Array.from({length:12},(_,i)=>item(`b${i}`,75)),...Array.from({length:4},(_,i)=>item(`c${i}`,50))];
  const today=selectToday(items,prefs,now);
  assert.equal(today.filter(a=>a.importanceGrade==='A').length,1);
  assert.deepEqual(today[0].importancePlacement.targets,{A:2,B:5,C:3});
  const after=selectToday(items,{...prefs,understoodArticleIds:['only-a']},now);
  assert.equal(after.length,10);assert.ok(after.every(a=>a.importanceGrade!=='A'));
});

test('Qualified recent-month A candidates are considered even when this week has enough B/C articles',()=>{
  const articles=[...Array.from({length:10},(_,i)=>item(`b${i}`,75)),...Array.from({length:4},(_,i)=>item(`c${i}`,50)),item('old-a1',95,{publishedAt:'2026-09-25T06:00:00Z'}),item('old-a2',94,{publishedAt:'2026-09-26T06:00:00Z'})];
  const today=selectToday(articles,prefs,now);
  assert.equal(today.filter(a=>a.importanceGrade==='A').length,2);
  assert.deepEqual(new Set(today.filter(a=>a.importanceGrade==='A').map(a=>a.id)),new Set(['old-a1','old-a2']));
});

test('Explore and details reuse Today grades, while bookmarked original facts stay intact',()=>{
  const articles=[item('a',92),item('b',70),item('c',50)],today=selectToday(articles,prefs,now),updated=applyTodayGrades(articles,today);
  assert.deepEqual(updated.map(a=>a.importanceGrade),today.map(a=>a.importanceGrade));
  assert.equal(updated[0].importanceScope,'today');
  assert.equal(articles[0].importanceScope,undefined);
  assert.equal(updated[0].url,articles[0].url);
});

test('Work discovery favors concrete paper, document and automation tasks without upgrading headlines',()=>{
  for(const title of ['NotebookLMで論文PDFを比較する方法','ObsidianのノートをAIで整理する手順','ChatGPTで報告書の下書きを点検する','AI秘書に予定管理を依頼する'])assert.ok(workDiscoveryPriority(item(title,0,{originalTitle:title}))>0,title);
  assert.equal(workDiscoveryPriority(item('generic',0,{originalTitle:'最強AIの新モデルが爆誕'})),0);
  const headline=item('unconfirmed',0,{originalTitle:'NotebookLMで論文PDFを比較する方法',summaryBasis:'unavailable',detailedSummary:'',originalSummary:''});
  assert.notEqual(evaluateImportance(headline,{now}).importanceGrade,'A');
  for(const title of ['Obsidianで顧客管理、AIに読ませる前の3つの決まり','ChatGPTでAI下書きを納品前に点検する'])assert.equal(readerFit(item(title,0,{originalTitle:title})).eligible,true,title);
  assert.equal(readerFit(item('engineering',0,{originalTitle:'Obsidian知識ベースをDockerの自宅サーバーで環境構築'})).eligible,false);
  assert.equal(readerFit(item('beginner',0,{originalTitle:'AI初心者が学校の資料を勉強に使ってみた'})).eligible,false);
  assert.equal(readerFit(item('investment',0,{originalTitle:'私の投資勉強ノート(Obsidian)を一部公開'})).eligible,false);
});

test('Unverified claims of perfect factual accuracy do not qualify an otherwise practical article as A',()=>{
  const article=item('claims',0,{originalTitle:'NotebookLMで論文PDFを比較：ハルシネーション完全ゼロの使い分け',detailedSummary:'論文PDFを添付し、比較する項目と出典を指定します。元の資料と照合し、同じ質問を複数の資料に対して実行する方法を説明しています。'.repeat(3)});
  const result=evaluateImportance(article,{now});
  assert.notEqual(result.importanceGrade,'A');
  assert.match(result.importanceLimits.join(' '),/断言/);
});

test('Note topic RSS endpoints are configured without authentication, and duplicate authors share a family',()=>{
  const sources=configuredSources({note:[{id:'official',handle:'info'},{id:'topic',tag:'AI活用'}]});
  assert.equal(sources[0].url,'https://note.com/info/rss');
  assert.equal(sources[1].url,'https://note.com/hashtag/AI%E6%B4%BB%E7%94%A8/rss');
  const xml='<rss><channel><item><title>NotebookLMで論文PDFを比較する方法</title><link>https://note.com/author/n/example</link><pubDate>Tue, 13 Oct 2026 06:00:00 GMT</pubDate><description>AIで資料を整理します。</description></item></channel></rss>';
  const a=parseFeed(xml,{id:'research',tag:'NotebookLM',sourceType:'note',name:'Topic'},now)[0];
  const b=parseFeed(xml,{id:'work',tag:'AI活用',sourceType:'note',name:'Topic'},now)[0];
  assert.equal(a.id,b.id);assert.equal(a.sourceFamily,'note · author');assert.equal(a.sourceFamily,b.sourceFamily);
});

test('Practical discoveries survive a busy generic feed before the bounded article cap',()=>{
  const general=Array.from({length:150},(_,i)=>item(`generic-${i}`,70,{originalTitle:'ChatGPTの新モデルを発表',publishedAt:new Date(now-i*60000).toISOString()}));
  const practical=item('paper',65,{originalTitle:'NotebookLMで論文PDFを比較する方法',publishedAt:'2026-10-09T06:00:00Z'});
  const feed=limitFeedArticles([...general,practical],100,now);
  assert.equal(feed.length,100);assert.ok(feed.some(a=>a.id==='paper'));
});

test('The body budget reads work candidates before generic announcements and preserves evidence limits',async()=>{
  const generic=item('new',70,{originalTitle:'ChatGPTの新モデルを発表',publishedAt:'2026-10-14T05:00:00Z'});
  const practical=item('paper',65,{originalTitle:'NotebookLMで論文PDFを比較する方法',publishedAt:'2026-10-09T06:00:00Z'});
  const requests=[];
  await enrichReaderArticles([generic,practical],{now,maxBodies:1,fetchImpl:async url=>{requests.push(url);return new Response('<html><body>本文なし</body></html>');}});
  assert.deepEqual(requests,[practical.url]);
});
