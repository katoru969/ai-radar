import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBluesky,parseMastodon,parseHackerNews} from '../lib/socials.mjs';
import {collectSources,configuredSources} from '../lib/feeds.mjs';
import {collectFeed} from '../lib/collect-feed.mjs';
import {deduplicateArticles,limitFeedArticles,normalizePreferences,selectToday,SOURCE_TYPES} from '../shared.js';
import {sanitizeSnapshot,sourceCacheFromSnapshot,preserveSnapshotOnFailure} from '../lib/snapshot.mjs';

const now = Date.parse('2026-10-07T12:00:00Z');
const source = {id:'social-test',name:'Test author',family:'Test author',sourceType:'bluesky',actor:'example.bsky.social',aiOnly:true};
const post = {
  uri:'at://did:plc:test/app.bsky.feed.post/3abc123',author:{did:'did:plc:test',handle:source.actor},
  record:{text:'New ChatGPT Agent https://example.com/ai',createdAt:'2026-10-06T10:00:00Z'},
  embed:{external:{title:'Introducing ChatGPT Agent',description:'Agent feature update',uri:'https://example.com/ai?utm_source=bluesky',thumb:'https://example.com/thumb.png'}},likeCount:12
};
const mastodonSource = {...source,sourceType:'mastodon',instance:'https://social.example'};
const mastodonPost = {id:'123',created_at:'2026-10-06T10:00:00Z',visibility:'public',url:'https://social.example/@author/123',content:'<p>ChatGPT Agent new features <script>bad()</script><a href="https://example.com/ai">Read</a></p>'};

test('Bluesky: normalize own public posts, embeds and metrics; omit replies and reposts',() => {
  const items = parseBluesky({feed:[{post},{post,reason:{$type:'repost'}},{post:{...post,record:{...post.record,reply:{}}}},{post:{...post,author:{...post.author,handle:'other.example'}}},{post:{...post,uri:'javascript:bad'}}]},source,now);
  assert.equal(items.length,1);
  assert.equal(items[0].linkedUrl,'https://example.com/ai');
  assert.equal(items[0].publishedAt,'2026-10-06T10:00:00.000Z');
  assert.equal(items[0].socialMetrics.likes,12);
  assert.ok(items[0].importanceScore < 72);
  assert.doesNotMatch(items[0].whyImportant,/公式の変更点/);
  assert.throws(() => parseBluesky({},source,now));
});

test('Mastodon: only public original posts; strip HTML and identify shared links',() => {
  const items = parseMastodon([mastodonPost,{...mastodonPost,visibility:'private'},{...mastodonPost,reblog:{}},{...mastodonPost,in_reply_to_id:'3'},{...mastodonPost,sensitive:true}],mastodonSource,now);
  assert.equal(items.length,1);
  assert.doesNotMatch(items[0].originalSummary,/bad\(|<p>/);
  assert.equal(items[0].linkedUrl,'https://example.com/ai');
  assert.ok(items[0].terms.includes('Agent'));
  assert.throws(() => parseMastodon({},mastodonSource,now));
});

test('Hacker News: publication time is submission time; filter non-AI, deleted, dead and jobs',() => {
  const hnSource = {...source,sourceType:'hackernews'};
  const item = {id:123,type:'story',title:'New AI Agent',url:'https://example.com/ai',time:Math.floor((now - 1000)/1000),score:100,descendants:20};
  const items = parseHackerNews([item,{...item,deleted:true},{...item,dead:true},{...item,type:'job'},{...item,title:'A baking recipe',text:''},{...item,time:NaN},{...item,time:Number.MAX_VALUE}],hnSource,now);
  assert.equal(items.length,1);
  assert.equal(items[0].discussionUrl,'https://news.ycombinator.com/item?id=123');
  assert.deepEqual(items[0].socialMetrics,{points:100,comments:20});
  assert.ok(items[0].importanceScore < 72);
});

test('Adapters use public endpoints without Authorization and isolate partial HN failures',async () => {
  const config = {bluesky:[source],mastodon:[{...mastodonSource,id:'mastodon-test',account:'author'}],hackernews:[{id:'hn',name:'HN',aiOnly:true}]};
  let paidCalls = 0;
  const fetchImpl = async (url,options) => {
    assert.equal(options.headers.authorization,undefined);
    if (url.includes('api.openai.com')) {paidCalls++;throw new Error('paid request');}
    if (url.includes('getAuthorFeed')) return Response.json({feed:[{post}]});
    if (url.includes('accounts/lookup')) return Response.json({id:'123'});
    if (url.includes('/statuses')) return Response.json([mastodonPost]);
    if (url.includes('topstories.json')) return Response.json([1,2]);
    if (url.includes('item/1.json')) return Response.json({id:1,type:'story',title:'New Gemini app features',url:'https://example.com/hn',time:Math.floor(now/1000)});
    return new Response('failed',{status:503});
  };
  const result = await collectFeed(config,{fetchImpl,now});
  assert.equal(paidCalls,0);
  assert.equal(result.sources.find(item => item.id === 'hn').status,'partial');
  assert.ok(result.articles.length >= 2);
  assert.equal(result.degraded,true);
});

test('RSS topics and source switches support all five additions without X or Reddit',() => {
  const config = {zenn:[{id:'zenn',topic:'mcp'}],qiita:[{id:'qiita',tag:'生成ai'}],bluesky:[source,{...source,id:'off',enabled:false}],hackernews:[{id:'hn'}],mastodon:[mastodonSource]};
  const sources = configuredSources(config);
  assert.equal(sources.length,5);
  assert.equal(sources.find(item => item.id === 'zenn').url,'https://zenn.dev/topics/mcp/feed');
  assert.ok(sources.find(item => item.id === 'qiita').url.includes('%E7%94%9F%E6%88%90ai'));
  const prefs = normalizePreferences({sources:{official:false,GitHub:false,X:true},understood:['Agent','Agent','Unknown'],notifications:{digest:true}});
  assert.equal(prefs.sources.official,false);
  assert.equal(prefs.sources.github,false);
  assert.ok(prefs.sources.bluesky);
  assert.deepEqual(prefs.understood,['Agent']);
  assert.equal(prefs.notifications.digest,true);
  assert.ok(!Object.hasOwn(prefs.sources,'x'));
  assert.ok(!SOURCE_TYPES.includes('reddit'));
});

test('Duplicate shared links keep the official original; feed retains less prolific sources',() => {
  const social = parseBluesky({feed:[{post}]},source,now)[0];
  const official = {...social,id:'official',sourceType:'official',source:'Official',sourceFamily:'Official',url:'https://example.com/ai',linkedUrl:''};
  assert.deepEqual(deduplicateArticles([social,official]),[official]);
  const newest = Array.from({length:120},(_,index) => ({...official,id:String(index),url:`https://example.com/${index}`,publishedAt:new Date(now - index*1000).toISOString()}));
  const limited = limitFeedArticles([...newest,social],100,now);
  assert.equal(limited.length,100);
  assert.ok(limited.some(item => item.sourceType === 'bluesky'));
});

test('Today ranks useful information rather than reserving three official slots',() => {
  const social = parseBluesky({feed:[{post}]},source,now)[0];
  const items = Array.from({length:20},(_,index) => ({...social,id:String(index),sourceFamily:`Community ${index}`,importanceScore:71}));
  for (let index=0;index<3;index++) items.push({...social,id:`official-${index}`,sourceType:'official',sourceFamily:`Publisher ${index}`,importanceScore:70});
  const today = selectToday(items,{sources:{},interests:[]},now);
  assert.equal(today.length,5);
  assert.equal(today.filter(item => item.sourceType === 'official').length,0);
  assert.equal(selectToday(items,{sources:{bluesky:false},interests:[]},now).length,3);
});

test('Public snapshots whitelist fields and retain genuine collection dates during total failure',() => {
  const article = parseBluesky({feed:[{post}]},source,now)[0];
  const original = {generatedAt:'2026-10-06T12:00:00Z',articles:[{...article,apiKey:'never publish'}],sources:[{id:source.id,name:source.name,sourceType:'bluesky',status:'ok',fetchedAt:'2026-10-06T12:00:00Z',count:1}],env:{OPENAI_API_KEY:'never publish'}};
  const snapshot = sanitizeSnapshot(original);
  assert.ok(!JSON.stringify(snapshot).includes('never publish'));
  assert.equal(sourceCacheFromSnapshot(snapshot).get(source.id).articles.length,1);
  const failure = {generatedAt:null,checkedAt:'2026-10-07T12:00:00Z',articles:[],sources:[{id:source.id,status:'error'}]};
  const preserved = preserveSnapshotOnFailure(failure,snapshot);
  assert.equal(preserved.generatedAt,original.generatedAt);
  assert.equal(preserved.articles.length,1);
  assert.equal(preserved.degraded,true);
  const removed = preserveSnapshotOnFailure({...failure,sources:[{id:'different',status:'error'}]},snapshot);
  assert.equal(removed.articles.length,0);
});
