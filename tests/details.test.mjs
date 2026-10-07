import test from 'node:test';
import assert from 'node:assert/strict';
import {publicFigureUrl,sanitizeFigures,sanitizeVideoSections} from '../article-details.js';
import {extractJapaneseBody,enrichReaderArticles,SUMMARY_VERSION} from '../lib/reader-summary.mjs';
import {descriptionChapters,parseJapaneseCaptions,transcriptSentences,summarizeTranscript,fetchVideoTranscript,enrichVideoArticles} from '../lib/video-summary.mjs';
import {sanitizeSnapshot} from '../lib/snapshot.mjs';
import guides from '../content/video-guides.json' with {type:'json'};

const now = Date.parse('2026-10-07T15:00:00Z');
const videoUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
const bodyUrl = 'https://zenn.dev/test/articles/guide';
const text = 'ChatGPTに音声を添付すると、議事録と次の作業を整理できます。画面の添付ボタンから音声ファイルを選んで、要点と担当者を表でまとめるよう依頼します。結果は元の録音と照合し、誤認識や担当者の取り違えがないか確認してください。';
const article = {id:'test',title:'ChatGPTの使い方',originalTitle:'ChatGPTの使い方',originalSummary:text,source:'Test',sourceId:'test',sourceType:'youtube',url:videoUrl,publishedAt:'2026-10-06T00:00:00Z',importanceScore:80,terms:[],topics:[]};

test('Body figures pick explanatory diagrams and screens, excluding hero, avatar, ads and small images',()=>{
  const html = `<nav><img src="https://static.zenn.studio/user-upload/outside.png" alt="操作画面"></nav><article class="znc"><p>${text}</p><img src="https://static.zenn.studio/user-upload/hero.png" alt="ニュース用サムネイル"><img src="https://static.zenn.studio/user-upload/avatar/face.png" alt="著者"><figure><img src="https://static.zenn.studio/user-upload/flow.png" alt="録音から議事録を作る手順を示す図"><figcaption>音声からタスクへ変換する流れ</figcaption></figure><h2>添付ボタンをクリックする操作画面</h2><p><img src="https://static.zenn.studio/user-upload/screen.png" alt="image.png"></p><img src="https://static.zenn.studio/user-upload/small.png" alt="設定画面" width="32" height="32"><div class="advert"><img src="https://static.zenn.studio/user-upload/ad.png" alt="設定手順"></div><figure><img src="http://localhost/private.png" alt="構成図"></figure></article>`;
  const body = extractJapaneseBody(html,bodyUrl);
  assert.equal(body.figures.length,2); assert.match(body.figures[0].url,/flow.png/); assert.match(body.figures[1].url,/screen.png/); assert.ok(body.figures.every(figure=>figure.sourceUrl === bodyUrl));
});
test('Figure URLs and attribution cannot point to arbitrary hosts, credentials, private URLs or another article',()=>{
  for (const value of ['javascript:alert(1)','data:image/svg+xml,test','http://note.com/figure.png','https://127.0.0.1/a.png','https://evil.example/figure.png','https://user:secret@static.zenn.studio/image.png','https://storage.googleapis.com/private/data.png','https://static.zenn.studio/icon.svg','https://res.cloudinary.com/other/image/upload/a.png']) assert.equal(publicFigureUrl(value),'',value);
  assert.ok(publicFigureUrl('https://static.zenn.studio/user-upload/figure.png'));
  assert.deepEqual(sanitizeFigures([{url:'https://static.zenn.studio/user-upload/figure.png',sourceUrl:'https://zenn.dev/other/articles/guide'}],bodyUrl),[]);
  assert.equal(sanitizeFigures([{url:'https://static.zenn.studio/user-upload/figure.png',sourceUrl:bodyUrl+'?utm_source=test'}],bodyUrl).length,1);
});
test('Article summary cache retains figures with the genuine body check time',async()=>{
  const item={...article,sourceType:'zenn',url:bodyUrl};
  const first = await enrichReaderArticles([item],{now,fetchImpl:async()=>new Response(`<article><p>${text}</p><figure><img src="https://static.zenn.studio/user-upload/figure.png" alt="操作手順の図"></figure></article>`)});
  assert.equal(first[0].figures.length,1);
  const second = await enrichReaderArticles([item],{now:now+1000,cache:new Map([[item.id,first[0]]]),fetchImpl:async()=>{throw new Error('must reuse');}});
  assert.deepEqual(second[0].figures,first[0].figures); assert.equal(second[0].bodyCheckedAt,first[0].bodyCheckedAt);
});
test('Description chapters preserve genuine timestamps and omit promotional chapters',()=>{
  const chapters=descriptionChapters('00:00 新機能\n01:24 操作の流れ\n06:23 スマホで使う\n14:17 チャンネル案内\n00:90 不正時刻',videoUrl);
  assert.deepEqual(chapters.map(chapter=>chapter.startSeconds),[0,84,383]); assert.equal(chapters[1].url,videoUrl+'&t=84s');
});
test('Captions parse Japanese JSON3 and XML, joining segmented Japanese and retaining times',()=>{
  const rows=parseJapaneseCaptions(JSON.stringify({events:[{tStartMs:84000,segs:[{utf8:'設定画面を'},{utf8:'開きます。'}]},{tStartMs:85000,segs:[{utf8:'[音楽]'}]},{tStartMs:-500,segs:[{utf8:'非表示'}]}]}));
  assert.deepEqual(rows,[{startSeconds:84,text:'設定画面を開きます。'}]);
  assert.deepEqual(parseJapaneseCaptions('<transcript><text start="84.5" dur="2">設定画面を開きます。</text></transcript>'),rows);
  assert.deepEqual(parseJapaneseCaptions('<timedtext><body><p t="84000"><s>設定画面を開きます。</s></p></body></timedtext>'),rows);
});
test('Transcript sentences join line breaks without inventing missing operation details',()=>{
  const rows=transcriptSentences([{startSeconds:80,text:'まず設定画面を開いて、'},{startSeconds:83,text:'使いたい音声ファイルを添付します。'},{startSeconds:86,text:'公式LINEに登録するとプレゼントを受け取ることができます。'}]);
  assert.equal(rows.length,1); assert.equal(rows[0].startSeconds,80); assert.equal(rows[0].text,'まず設定画面を開いて、使いたい音声ファイルを添付します。');
  assert.deepEqual(transcriptSentences([{startSeconds:100,text:'説明されていない操作'.repeat(100)}]),[]);
});
test('Automatic transcript summary uses only operation sentences within the demonstrated chapter',()=>{
  const segments=[{startSeconds:0,text:'ChatGPTに音声を渡すと議事録を作成する機能を利用できます。'},{startSeconds:80,text:'まず添付ボタンを選択し、使いたい音声ファイルを選んでアップロードします。'},{startSeconds:90,text:'会議の決定事項と担当者をまとめてくださいと入力して送信します。'},{startSeconds:110,text:'表示された議事録と録音を照合して、誤認識や担当者の取り違えを確認します。'},{startSeconds:125,text:'無料プランと有料プランでは利用できる回数が異なるので、利用枠を確認してください。'}];
  const summary=summarizeTranscript(segments,[{title:'機能説明',startSeconds:0},{title:'議事録のハンズオン',startSeconds:80}],videoUrl);
  assert.ok(summary); assert.ok(summary.videoSections[0].steps.length >= 2); assert.equal(summary.videoSections[0].startSeconds,80); assert.doesNotMatch(summary.detailedSummary,/980円|スプレッドシート|ダウンロード/);
});
test('Empty captions leave hands-on unconfirmed and chapter titles never become a detailed summary',async()=>{
  const item={...article,originalSummary:'本日はChatGPTの新機能を解説します\n① ハンズオン1\n② ハンズオン2'};
  const result=await enrichVideoArticles([item],{now,reviewedGuides:[],fetchImpl:async()=>new Response('<h1>Unavailable</h1>')});
  assert.equal(result[0].detailedSummary,''); assert.equal(result[0].transcriptStatus,'unavailable'); assert.deepEqual(result[0].videoSections || [],[]);
});
test('Reviewed video guides match the exact video, title and source, with no paid calls',async()=>{
  const guide=guides[0]; let requests=0;
  const item={...article,url:`https://www.youtube.com/watch?v=${guide.videoId}`,sourceId:guide.sourceId,originalTitle:guide.originalTitle};
  const result=await enrichVideoArticles([item],{now,fetchImpl:async()=>{requests++; throw new Error('must not fetch');}});
  assert.equal(requests,0); assert.equal(result[0].summaryBasis,'video-transcript'); assert.equal(result[0].videoSummaryOrigin,'reviewed'); assert.ok(result[0].videoSections.length); assert.ok(result[0].detailedSummary.length >= 300);
  const changed=await enrichVideoArticles([{...item,originalTitle:'ChatGPTの異なる動画'}],{now,fetchImpl:async()=>{requests++;throw new Error('unavailable');}});
  assert.equal(changed[0].videoSummaryOrigin,''); assert.deepEqual(changed[0].videoSections,[]); assert.notEqual(changed[0].detailedSummary,guide.detailedSummary);
});
test('Caption URLs from the public page are validated, and signed URLs never enter snapshots',async()=>{
  const player={videoDetails:{videoId:'abcdefghijk',shortDescription:'01:24 操作の流れ'},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'ja',kind:'asr',baseUrl:'https://www.youtube.com/api/timedtext?v=abcdefghijk&signature=private-signed-token'}]}}};
  const transcript=await fetchVideoTranscript(videoUrl,{fetchImpl:async url=>new Response(url.includes('/api/timedtext') ? JSON.stringify({events:[{tStartMs:84000,segs:[{utf8:text}]}]}) : `<script>ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`)});
  assert.equal(transcript.segments.length,1); assert.equal(transcript.captionKind,'auto');
  player.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl='http://127.0.0.1/private'; let calls=0;
  const blocked=await fetchVideoTranscript(videoUrl,{fetchImpl:async()=>{calls++;return new Response(`<script>ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`);}});
  assert.equal(calls,1); assert.deepEqual(blocked.segments,[]);
  const snapshot=sanitizeSnapshot({articles:[{...article,captionUrl:'https://youtube.com/api/timedtext?signature=private-signed-token',transcript:text.repeat(500),summaryBasis:'video-transcript',summaryVersion:SUMMARY_VERSION,videoSections:[{title:'操作',startSeconds:84,steps:['実際の手順を確認する。'],url:'https://evil.example'}]}]});
  assert.doesNotMatch(JSON.stringify(snapshot),/private-signed-token|"transcript":|evil.example/); assert.equal(snapshot.articles[0].videoSections[0].url,videoUrl+'&t=84s');
});
test('Transcript fallback cache does not renew check time and never publishes unconfirmed steps',async()=>{
  const first={...article,summaryVersion:SUMMARY_VERSION,summaryBasis:'video-description',transcriptStatus:'unavailable',transcriptCheckedAt:new Date(now-1000).toISOString(),videoSections:[],videoChapters:[]}; let requests=0;
  const result=await enrichVideoArticles([{...article}],{now,reviewedGuides:[],cache:new Map([[article.id,first]]),fetchImpl:async()=>{requests++;throw new Error('must reuse');}});
  assert.equal(requests,0); assert.equal(result[0].transcriptCheckedAt,first.transcriptCheckedAt);
  const snapshot=sanitizeSnapshot({articles:[{...first,videoSections:[{title:'未確認の操作',startSeconds:84,steps:['作り話の手順']}]}]}); assert.deepEqual(snapshot.articles[0].videoSections,[]);
});
test('Published reviewed guides are bounded, evidence-linked and contain no raw captions or personal paths',()=>{
  for (const guide of guides) {
    assert.ok(guide.summary.length <= 150 && guide.detailedSummary.length <= 650); assert.ok(Number.isFinite(Date.parse(guide.checkedAt))); assert.ok(guide.sections.length >= 1 && guide.sections.length <= 3);
    for (const section of guide.sections) assert.ok(section.steps.length >= 1 && section.steps.length <= 4 && section.startSeconds >= 0);
  }
  assert.doesNotMatch(JSON.stringify(guides),/C:\\|signature=|api_key=|\[\d+:\d+\]/);
});
