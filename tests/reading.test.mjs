import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReadingState,setArticleUnderstood,toggleArticleBookmark,findReadingArticle,readingCollection} from '../article-state.js';
import {selectToday} from '../shared.js';

const now = Date.parse('2026-10-08T09:00:00Z');
const article = index => ({id:String(index),title:`ChatGPTで議事録を作る方法 ${index}`,originalTitle:`ChatGPTで議事録を作る方法 ${index}`,source:'Test',sourceFamily:`Source ${index % 4}`,sourceType:'official',url:`https://example.com/${index}`,publishedAt:new Date(now-index*3600000).toISOString(),importanceScore:90,topics:[],summary:'音声から議事録を作る方法を紹介しています。',detailedSummary:'音声を添付して、出力した議事録と録音を照合します。',summaryBasis:'article'});

test('Ten unread articles are selected, excluded articles backfill, and reload never restores understood items',() => {
  const articles = Array.from({length:14},(_,index)=>article(index));
  const first = selectToday(articles,{sources:{},interests:[]},now);
  assert.equal(first.length,10);
  let state = setArticleUnderstood(normalizeReadingState(null),first[0].id);
  state = normalizeReadingState(JSON.parse(JSON.stringify(state)));
  const next = selectToday(articles,{sources:{},interests:[],understoodArticleIds:state.understoodIds},now);
  assert.equal(next.length,10); assert.ok(!next.some(item=>item.id === first[0].id));
  for (const item of articles) state = setArticleUnderstood(state,item.id);
  assert.deepEqual(selectToday(articles,{sources:{},interests:[],understoodArticleIds:state.understoodIds},now),[]);
  state = setArticleUnderstood(state,first[0].id,false);
  assert.equal(selectToday(articles,{sources:{},interests:[],understoodArticleIds:state.understoodIds},now)[0].id,first[0].id);
});

test('Bookmarks retain a copy after a feed rotation and remain available when understood',() => {
  const savedArticle = article(1);
  const original = normalizeReadingState(null);
  let state = toggleArticleBookmark(original,savedArticle,now);
  savedArticle.detailedSummary = 'The original object has changed';
  state = normalizeReadingState(JSON.parse(JSON.stringify(setArticleUnderstood(state,'1'))));
  assert.equal(original.bookmarks.length,0);
  assert.equal(findReadingArticle('1',[],state).detailedSummary,'音声を添付して、出力した議事録と録音を照合します。');
  assert.equal(readingCollection([],state,'bookmarked').length,1);
  assert.equal(readingCollection([],state,'understood').length,1);
  assert.equal(state.bookmarks[0].savedAt,new Date(now).toISOString());
  state = toggleArticleBookmark(state,article(1),now);
  assert.equal(state.bookmarks.length,0); assert.deepEqual(state.understoodIds,['1']);
});

test('A newer feed article is preferred without duplicates or changing the bookmark snapshot',() => {
  const stored = article(1), newer = {...stored,summary:'更新された本文の要点'};
  const state = setArticleUnderstood(toggleArticleBookmark(normalizeReadingState(null),stored,now),'1');
  assert.equal(readingCollection([newer],state,'bookmarked')[0].summary,newer.summary);
  assert.equal(readingCollection([newer],state,'understood').length,1);
  assert.equal(state.bookmarks[0].article.summary,stored.summary);
});

test('Malformed saved entries do not mix article understanding with term learning',() => {
  const state = normalizeReadingState({understood:['Agent'],understoodIds:['1','1',null,{}],bookmarks:[null,{article:article(1)},{article:article(1)}, {article:{id:''}}]});
  assert.deepEqual(state.understoodIds,['1']); assert.equal(state.bookmarks.length,1);
  assert.deepEqual(normalizeReadingState('invalid'),{version:1,understoodIds:[],bookmarks:[]});
});

test('Thirty-day unread articles fill a short recent digest without showing older or disabled sources',() => {
  const fresh = Array.from({length:4},(_,index)=>article(index));
  const older = Array.from({length:8},(_,index)=>({...article(index+10),publishedAt:new Date(now-(10+index)*86400000).toISOString()}));
  const stale = {...article(99),publishedAt:new Date(now-31*86400000).toISOString()};
  const selected = selectToday([...fresh,...older,stale],{sources:{},interests:[],understoodArticleIds:['0']},now);
  assert.equal(selected.length,10); assert.ok(!selected.some(item=>['0','99'].includes(item.id)));
  assert.deepEqual(selectToday([...fresh,...older],{sources:{official:false},interests:[]},now),[]);
});
