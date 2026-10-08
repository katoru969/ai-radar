import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {selectToday,isFreshArticle,readerFit} from '../shared.js';
import {feedRequestUrl,validFeedPayload,olderFeed,describeFeedRefresh} from '../feed-refresh.js';

const now = Date.parse('2026-10-08T05:00:00Z');
const hour = 3600000;
const article = (id,age,score = 75,overrides = {}) => ({
  id,title:`ChatGPTで議事録を整理する方法 ${id}`,originalTitle:`ChatGPTで議事録を整理する方法 ${id}`,
  publishedAt:new Date(now-age*hour).toISOString(),importanceScore:score,sourceFamily:id,source:id,sourceType:'official',
  topics:[],summary:'記事の要点',detailedSummary:'本文で確認した手順',summaryBasis:'article',...overrides
});
const prefs = {sources:{},interests:[]};

test('Today surfaces new practical articles even when yesterday has higher scores and reviewed videos',() => {
  const old = Array.from({length:14},(_,index) => article(`old-${index}`,48+index,100));
  old.push(article('old-video',120,100,{sourceType:'youtube',summaryBasis:'video-transcript'}));
  const fresh = ['new-1','new-2','new-3'].map((id,index) => article(id,index+1,72));
  const today = selectToday([...old,...fresh],prefs,now);
  assert.equal(today.length,10);
  assert.deepEqual(new Set(today.slice(0,3).map(item=>item.id)),new Set(fresh.map(item=>item.id)));
  assert.ok(!today.some(item=>item.id==='old-video'));
});

test('Fresh slots respect source switches, publisher variety, practical content and summary evidence',() => {
  const items = [article('a',1,91),article('b',2,90,{sourceFamily:'a'}),article('c',3,89,{sourceFamily:'a'}),
    article('off',1,100,{sourceType:'note'}),article('missing',1,100,{summaryBasis:'unavailable'}),
    article('old',50,100),article('other',4),article('refactor',1,100,{originalTitle:'AIによるコードリファクタリングの安全な実行手順'})];
  const today=selectToday(items,{...prefs,sources:{note:false}},now);
  assert.equal(today.length,5);
  assert.equal(today.filter(item=>item.sourceFamily==='a').length,3);
  assert.ok(['a','b','other'].every(id=>today.some(item=>item.id===id)));
  assert.ok(!today.some(item=>['off','missing','refactor'].includes(item.id)));
  assert.equal(readerFit(items.at(-1)).eligible,false);
  assert.equal(readerFit(article('pricing',1,100,{originalTitle:'待望のClaude Haiku 5.5がリリース!! コスパモデルになるか?',summary:'トークナイザーの変更に注意。コスト効率の高いコーディングパイプラインを構築できます。'})).eligible,false);
});

test('No new news keeps a useful digest without relabelling old articles as fresh',() => {
  const items=[article('a',72),article('b',73),article('video',74,75,{sourceType:'youtube',summaryBasis:'video-transcript'})];
  assert.equal(selectToday(items,prefs,now).length,3);
  assert.ok(items.every(item=>!isFreshArticle(item,now)));
  assert.equal(isFreshArticle(article('future',-1),now),false);
  assert.equal(selectToday(items.slice(0,1),prefs,now).length,1);
});

test('Refresh distinguishes unchanged news, new IDs and edits independently of collection timestamps',() => {
  const existing=article('same',1);
  assert.equal(describeFeedRefresh([existing],[{...existing,bodyCheckedAt:new Date(now).toISOString()}]),'新着はありません');
  assert.equal(describeFeedRefresh([existing],[existing,article('new',0)]),'新着1件を反映しました');
  assert.equal(describeFeedRefresh([existing],[{...existing,detailedSummary:'新しい本文の要点'}]),'記事の内容を更新しました');
  assert.equal(describeFeedRefresh([], [existing]),'最新の公開データを確認しました');
  assert.equal(validFeedPayload({articles:[],sources:[],generatedAt:new Date(now).toISOString()}),true);
  assert.equal(validFeedPayload({articles:[],sources:[],generatedAt:'invalid'}),false);
  assert.equal(validFeedPayload({error:'gateway unavailable'}),false);
  assert.equal(olderFeed({generatedAt:new Date(now).toISOString()},{generatedAt:new Date(now-hour).toISOString()}),true);
  assert.equal(olderFeed({generatedAt:new Date(now).toISOString()},{generatedAt:new Date(now).toISOString()}),false);
});

test('Static refresh bypasses old CDN responses and stays inside the deployed base path',() => {
  const first=feedRequestUrl('./data/feed.json','https://example.com/ai-radar/',now);
  const second=feedRequestUrl('./data/feed.json','https://example.com/ai-radar/',now+1);
  assert.equal(first.pathname,'/ai-radar/data/feed.json');
  assert.notEqual(first.href,second.href);
  assert.equal(feedRequestUrl('./api/feed','https://example.com/',now).href,'https://example.com/api/feed');
});

test('Service worker shares one feed cache across refresh queries and retains the last good snapshot',async () => {
  const listeners={},stored=new Map(); let network,options;
  const key=request=>typeof request==='string' ? request : request.url;
  const cache={put:async(request,response)=>stored.set(key(request),response.clone()),match:async request=>stored.get(key(request))?.clone()};
  const context={URL,Headers,Response,Date,Set,Promise,Error,self:{location:{href:'https://example.com/ai-radar/sw.js'},addEventListener:(type,listener)=>{listeners[type]=listener;}},
    caches:{open:async()=>cache},fetch:async(request,init)=>{options=init; if(network instanceof Error) throw network; return network.clone();}};
  vm.runInNewContext(await fs.readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
  const good={generatedAt:new Date(now).toISOString(),articles:[article('saved',1)],sources:[]};
  // Browser fetches are 'basic'; cloning a Response in Node preserves its data, but not that browser type.
  const response=body=>{const result=new Response(JSON.stringify(body)); const clone=result.clone.bind(result); result.clone=()=>{const copy=clone();Object.defineProperty(copy,'type',{value:'basic'});return copy;};return result;};
  const request=async stamp=>{let result;listeners.fetch({request:new Request(`https://example.com/ai-radar/data/feed.json?_radar=${stamp}`),respondWith:value=>{result=value;}});return result;};
  network=response(good); await request(1);
  assert.equal(options.cache,'no-store');
  assert.deepEqual([...stored.keys()],['https://example.com/ai-radar/data/feed.json']);
  network=new Error('offline');
  const offline=await request(2);
  assert.equal(offline.headers.get('X-AI-Radar-Cached'),'1');
  assert.equal((await offline.json()).generatedAt,good.generatedAt);
  network=response({error:'upstream changed'});
  assert.equal((await request(3)).headers.get('X-AI-Radar-Cached'),'1');
  network=response({...good,generatedAt:new Date(now-hour).toISOString()});
  assert.equal((await (await request(4)).json()).generatedAt,good.generatedAt);
  assert.equal(stored.size,1);
});
