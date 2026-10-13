import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchVideoTranscript,enrichVideoArticles,transcriptQueue,applyVideoTranscript,parseTranscriptExport} from '../lib/video-summary.mjs';
import {transcriptPanelSegments} from '../lib/transcript-panel.mjs';
import {SUMMARY_VERSION} from '../lib/reader-summary.mjs';
import {selectToday,readerFit} from '../shared.js';
import guides from '../content/video-guides.json' with {type:'json'};
import {sanitizeSnapshot} from '../lib/snapshot.mjs';

const now=Date.parse('2026-10-13T06:00:00Z'),url='https://www.youtube.com/watch?v=abcdefghijk';
const article={id:'video',sourceId:'keito',sourceFamily:'keito',sourceType:'youtube',source:'KEITO',url,title:'ChatGPTの新機能を活用',originalTitle:'ChatGPTの新機能を活用',originalSummary:'01:00 ChatGPTで議事録の作り方',publishedAt:'2026-10-12T03:00:00Z',importanceScore:85,topics:['使い方・設定'],terms:[],summaryBasis:'video-description',detailedSummary:''};
const text='ChatGPTに会議の音声を渡すと議事録を作成できます。まず音声ファイルを添付し、担当者と決定事項を表で整理するよう入力して送信します。表示された文章を録音と照合し、誤認識や担当者の取り違えを確認してください。無料プランと有料プランでは利用できる回数が異なるため、試す前に利用枠を確認してください。';

test('A Japanese caption track returning HTTP 200 with no body is an acquisition failure, not missing subtitles',async()=>{
  const player={videoDetails:{videoId:'abcdefghijk'},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'ja',kind:'asr',baseUrl:url.replace('/watch','/api/timedtext')+'&exp=xpe'}]}}};
  const result=await fetchVideoTranscript(url,{fetchImpl:async target=>new Response(target.includes('/api/timedtext') ? '' : `<script>ytInitialPlayerResponse=${JSON.stringify(player)};</script>`)});
  assert.equal(result.reason,'caption_response_empty');assert.equal(result.status,'unavailable');
});
test('Failures are retried after two hours, while confirmed summaries survive a later collection',async()=>{
  let calls=0;const saved={...article,summaryVersion:SUMMARY_VERSION,transcriptCheckedAt:new Date(now-3*3600000).toISOString(),transcriptStatus:'unavailable'};
  await enrichVideoArticles([{...article}],{now,reviewedGuides:[],cache:new Map([[article.id,saved]]),fetchImpl:async()=>{calls++;return new Response('<h1>Not available</h1>');}});
  assert.equal(calls,1);
  const confirmed={...saved,summaryBasis:'video-transcript',transcriptStatus:'available',summary:'確認できた要点',detailedSummary:text,transcriptCheckedAt:new Date(now-5*86400000).toISOString()};
  const reused=await enrichVideoArticles([{...article}],{now,reviewedGuides:[],cache:new Map([[article.id,confirmed]]),fetchImpl:async()=>{throw new Error('must reuse');}});
  assert.equal(reused[0].detailedSummary,text);assert.equal(reused[0].transcriptCheckedAt,confirmed.transcriptCheckedAt);
});
test('Transcript queue includes localized English titles with Japanese descriptions and rotates previously unattempted videos',()=>{
  const clips=Array.from({length:16},(_,i)=>({...article,id:String(i),sourceFamily:'source'+i,url:'https://www.youtube.com/watch?v='+String(i).padStart(11,'0'),importanceScore:90-i,transcriptCheckedAt:i<10 ? new Date(now-3600000).toISOString() : null}));
  clips[0].originalTitle='ChatGPT new feature';
  const selected=transcriptQueue(clips,{now,maxVideos:6});
  assert.ok(selected.some(item=>Number(item.id)>=10));assert.equal(selected.length,6);
  const blocked=clips.map(item=>({...item,browserTranscriptCheckedAt:new Date(now-3600000).toISOString()}));
  assert.equal(transcriptQueue(blocked,{now,maxVideos:6,browser:true}).length,0);
});
test('Public transcript response and local Japanese exports retain real times and ignore unrelated text',()=>{
  const data={actions:[{transcriptSegmentRenderer:{startMs:'120500',snippet:{runs:[{text:'添付ボタンから音声ファイルを選びます。'}]}}},{transcriptSegmentViewModel:{startMs:'125000',text:{content:'議事録の担当者を確認してください。'}}},{videoRenderer:{title:{runs:[{text:'無関係な操作'}]}}}]};
  const segments=transcriptPanelSegments(data);assert.deepEqual(segments.map(s=>s.startSeconds),[120,125]);assert.equal(segments.length,2);
  const exported='Video ID: abcdefghijk\nLanguage: ja\n[2:00] 音声ファイルを添付します。\n[2:99] 不正な時刻\n[2:10] [音楽]';
  assert.equal(parseTranscriptExport(exported,'abcdefghijk').length,1);assert.deepEqual(parseTranscriptExport(exported,'another_vid'),[]);assert.deepEqual(parseTranscriptExport(exported.replace('Language: ja','Language: en'),'abcdefghijk'),[]);
});
test('Browser transcript enrichment publishes only a bounded summary, provenance and genuine operations',()=>{
  const item={...article,videoChapters:[],videoSections:[]};
  assert.ok(applyVideoTranscript(item,{segments:[{startSeconds:60,text}],captionKind:'auto'},{now,method:'browser'}));
  assert.equal(item.transcriptStatus,'available');assert.equal(item.transcriptMethod,'browser');assert.equal(item.browserTranscriptCheckedAt,new Date(now).toISOString());
  const clean=sanitizeSnapshot({articles:[{...item,transcript:text.repeat(100),captionUrl:'https://youtube.com/api/timedtext?pot=secret'}]}).articles[0];
  assert.doesNotMatch(JSON.stringify(clean),/"transcript":|pot=secret/);assert.equal(clean.transcriptMethod,'browser');
  assert.equal(applyVideoTranscript({...article,videoChapters:[]},{segments:[],reason:'browser_unavailable'},{now,method:'browser'}),false);
});
test('Ten substantial summaries keep empty video details out of Today, while Explore data and bookmarks remain available',()=>{
  const complete=Array.from({length:10},(_,i)=>({...article,id:'ready'+i,sourceFamily:'ready'+i,publishedAt:'2026-10-06T03:00:00Z',summaryBasis:'video-transcript',detailedSummary:text}));
  const empty={...article,id:'empty',publishedAt:'2026-10-13T05:00:00Z',importanceScore:99};
  const result=selectToday([empty,...complete],{sources:{},interests:[]},now);
  assert.equal(result.length,10);assert.ok(result.every(item=>item.detailedSummary.length>=140));assert.ok(!result.some(item=>item.id==='empty'));
  assert.ok(selectToday([empty],{sources:{},interests:[]},now).some(item=>item.id==='empty'));
});
test('A verified practical configuration guide is not removed just because its fuller summary repeats a product name',()=>{
  const guide=guides.find(item=>item.videoId==='pXZMwLLED4M');
  const enriched={...article,originalTitle:guide.originalTitle,summary:guide.summary,detailedSummary:guide.detailedSummary};
  assert.equal(readerFit(enriched).eligible,true);
  assert.equal(readerFit({...enriched,originalTitle:guide.alternateTitles[0]}).eligible,true);
  assert.equal(readerFit({...enriched,originalTitle:'Claude CodeのPython APIとSDKを実装する'}).eligible,false);
});
