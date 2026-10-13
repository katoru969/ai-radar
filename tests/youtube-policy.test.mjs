import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../sources.json' with {type:'json'};
import {readerFit,selectToday,normalizePreferences} from '../shared.js';
import {createArticle} from '../lib/articles.mjs';
import {configuredSources,parseFeed} from '../lib/feeds.mjs';
import {collectYouTubeSource,channelVideoCandidates} from '../lib/youtube.mjs';
import {toggleArticleBookmark,normalizeReadingState,readingCollection} from '../article-state.js';
import {videoDescription} from '../lib/text.mjs';
import {enrichVideoArticles} from '../lib/video-summary.mjs';

const now=Date.parse('2026-10-13T03:00:00Z');
const video=(title,overrides={})=>({id:title,originalTitle:title,title,originalSummary:'',sourceType:'youtube',sourceId:'youtube-pivot',source:'PIVOT',sourceFamily:'PIVOT',publishedAt:'2026-10-12T00:00:00Z',importanceScore:75,topics:[],summaryBasis:'video-description',url:'https://www.youtube.com/watch?v=abcdefghijk',...overrides});
const source={id:'yt',name:'Media',family:'Media',sourceType:'youtube',channelId:'UCtest',url:'https://www.youtube.com/feeds/videos.xml?channel_id=UCtest',aiOnly:true,scanRecent:30};
const grid=videos=>`<script>var ytInitialData=${JSON.stringify({contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{content:{richGridRenderer:{contents:videos.map(([id,title])=>({richItemRenderer:{content:{lockupViewModel:{contentType:'LOCKUP_CONTENT_TYPE_VIDEO',contentId:id,metadata:{lockupMetadataViewModel:{title:{content:title}}}}}}}))}}}}]}}})};</script>`;
const watch=(id,title)=>`<script>var ytInitialPlayerResponse=${JSON.stringify({videoDetails:{videoId:id,channelId:source.channelId,title,shortDescription:'AIが仕事を変える具体的な利用方法と注意点を解説します。'},microformat:{playerMicroformatRenderer:{publishDate:'2026-10-12T12:00:00+09:00'}}})};</script>`;
const rss=`<feed><entry><title>ChatGPTの新機能を公開</title><link href="https://www.youtube.com/watch?v=abcdefghijk"/><published>2026-10-12T03:00:00Z</published></entry></feed>`;

test('Removed channel stays excluded from Today even with an old local feed, but bookmarks remain readable',()=>{
  const retired=video('ChatGPTの新機能を実演',{sourceId:'youtube-mikimiki',source:'mikimiki web スクール',sourceFamily:'mikimiki'});
  const relevant=video('AIを使う仕事の未来',{id:'current',url:'https://www.youtube.com/watch?v=bbbbbbbbbbb'});
  assert.deepEqual(selectToday([retired,relevant],{sources:{},interests:[]},now).map(a=>a.id),['current']);
  const state=toggleArticleBookmark(normalizeReadingState(),retired,now);
  assert.equal(readingCollection([relevant],state,'bookmarked')[0].sourceId,'youtube-mikimiki');
  const active=configuredSources(config).filter(s=>s.sourceType==='youtube');
  assert.equal(active.length,9);
  assert.ok(!active.some(s=>s.id==='youtube-mikimiki'));
  assert.equal(new Set(active.map(s=>s.channelId)).size,active.length);
});
test('Video policy accepts advanced practical use, AI news roundups and society discussions',()=>{
  for(const title of ['AI時代はなぜ日本の好機なのか｜AI×民主主義','企業がすべきAI対策と政府のAI規制｜安野貴博','注目AIニュース19選｜Gemini agent・Codex連日更新・Windows AI構想','ガチ便利なAIテクニックを正しいカタチで身につけろ','AI力が確実に伸びる仕事のAI習慣','AIは何に課金すべきか？','OpenAI発表で今話題のdotsくんを実際に検証','Manusの新機能で電話予約を実演']) assert.equal(readerFit(video(title)).eligible,true,title);
  assert.equal(readerFit(video('AI時代の雇用と働き方')).category,'AIと仕事・社会');
  assert.equal(readerFit(video('AIは何に課金すべきか？')).category,'料金・利用条件');
});
test('Video policy keeps unrelated politics, promotional descriptions, beginner courses and engineering out',()=>{
  for(const title of ['ChatGPTの使い方・基礎を超初心者に解説','ゼロから学ぶGemini','ChatGPTの基礎を解説','Git/GitHubとは？AIバイブコーディングの超必須スキル入門','選挙制度改革の利点と課題','党首会見と予算案','PIVOTの日本株銘柄分析とAI投資信託','大谷翔平とAI×データで進化するMLB','AIエージェントAPIの実装で変える仕事','Claude Codeの環境構築と仕事術','AI会社の全社総会｜挑戦する仲間を募集中']) assert.equal(readerFit(video(title,{originalSummary:'無料のChatGPT講座はこちら。AIが仕事や社会を変えます。'})).eligible,false,title);
  assert.equal(readerFit(video('脱初心者：AIの使い方を見直す3つの方法')).eligible,true);
  assert.equal(readerFit(video('Claude DesktopのMCP設定を初心者向けに解説')).eligible,true);
  for(const title of ['AIツールにバグ修正を依頼するプロンプト改善手順','GoogleとChatGPTのクローラーの記録を並べてみた','Claude・ChatGPTからFAXを送るリモートMCPサーバーを作って公開した']) assert.equal(readerFit(video(title,{sourceType:'qiita'})).eligible,false,title);
  assert.equal(readerFit(video('Gemini Agentの新機能',{sourceType:'qiita',detailedSummary:'Cloud BillingでSpend Capを設定し、IAMロールを選びます。'})).eligible,false);
});
test('Society category and preferences survive source normalization without replacing existing choices',()=>{
  const article=createArticle({title:'AI時代の雇用と働き方',date:'2026-10-12',url:'https://www.youtube.com/watch?v=abcdefghijk',source},now);
  assert.equal(article.readerCategory,'AIと仕事・社会');
  assert.match(article.whyImportant,/社会/);
  assert.ok(article.topics.includes('AIと仕事・社会'));
  assert.deepEqual(normalizePreferences({interests:['新機能・料金','AIと仕事・社会'],sources:{youtube:false}}).interests,['新機能・料金','AIと仕事・社会']);
  assert.equal(normalizePreferences({sources:{youtube:false}}).sources.youtube,false);
});
test('High-volume channel supplements RSS with relevant page history, without duplicate or unrelated requests',async()=>{
  const urls=[];
  const html=grid([['abcdefghijk','ChatGPTの新機能を公開'],['bbbbbbbbbbb','選挙制度と会見'],['ccccccccccc','AIが仕事と社会を変える'],['ddddddddddd','超初心者のChatGPT使い方・基礎']]);
  assert.equal(channelVideoCandidates(html,30)[2].title,'AIが仕事と社会を変える');
  const result=await collectYouTubeSource(source,{parseFeed,now,fetchImpl:async(url,options)=>{
    urls.push(url); assert.equal(options.headers.authorization,undefined);
    if(url.includes('/feeds/'))return new Response(rss);
    if(url.includes('/watch?'))return new Response(watch('ccccccccccc','AIが仕事と社会を変える'));
    return new Response(html);
  }});
  assert.equal(result.articles.length,2);
  assert.equal(result.partial,false);
  assert.deepEqual(urls.filter(url=>url.includes('/watch?')),['https://www.youtube.com/watch?v=ccccccccccc']);
});
test('Supplement failure retains successful RSS instead of dropping the channel',async()=>{
  const result=await collectYouTubeSource(source,{parseFeed,now,fetchImpl:async url=>new Response(url.includes('/feeds/')?rss:'unavailable',{status:url.includes('/feeds/')?200:503})});
  assert.equal(result.articles.length,1);
  assert.equal(result.partial,true);
  assert.equal(result.failures.http_503,1);
});
test('A successfully read channel with no matching AI episode is empty, not an acquisition error',async()=>{
  const urls=[];
  const result=await collectYouTubeSource(source,{parseFeed,now,fetchImpl:async url=>{urls.push(url);return url.includes('/feeds/')?new Response(null,{status:404}):new Response(grid([['bbbbbbbbbbb','党首会見と選挙制度'],['ddddddddddd','超初心者のChatGPT使い方・基礎']]));}});
  assert.equal(result.articles.length,0);
  assert.equal(result.retrievalMethod,'youtube-page');
  assert.ok(!urls.some(url=>url.includes('/watch?')));
});
test('Media descriptions remove rewards and guest biographies while preserving genuine chapter times',()=>{
  const description=videoDescription('【通勤中に聴く】PIVOTアプリが便利\n視聴ごとにマイルが貯まり、図書カードの特典に応募できます。\n【5分で理解】この動画のAI要約はこちら\n＜ゲスト＞\n石井順也｜Sakana Al 防衛・インテリジェンス担当\n東大法学部卒、スタンフォード院修了。外務省や民間シンクタンクで勤務しました。\n00:00 ダイジェスト\n01:01 AI時代の情報漏洩リスク\n08:08 日本とフランスのAI政策\n写真：iStock');
  assert.doesNotMatch(description,/特典|マイル|図書カード|法学部卒|勤務|担当|iStock/);
  assert.match(description,/01:01 AI時代の情報漏洩リスク/);
  assert.match(description,/08:08 日本とフランスのAI政策/);
});
test('News overview survives surrounding sponsorship, new books and workshop promotion',()=>{
  const prose='AIエージェントが日常の仕事に常駐する存在へ変わり、今週のAIニュースを解説します。';
  const description=videoDescription(`スポンサード：企業名\nクーポンコード：DISCOUNT\n専用リンクで登録するとAIクレジットが2倍。\n${prose}\n新刊：Claude 最強のAI自動化術\n『AIの雇い方』\nワークショップの事前登録\n目次\n00:00 イントロ\n01:25 Geminiの新機能\n03:00 スポンサード：広告\n05:00 仕事に使うAIエージェント`);
  assert.match(description,new RegExp(prose));
  assert.doesNotMatch(description,/クーポン|クレジット|新刊|雇い方|事前登録|スポンサード/);
  assert.match(description,/05:00 仕事に使うAIエージェント/);
});
test('Unavailable captions yield description themes with an explicit limitation, never invented conclusions or steps',async()=>{
  const article=video('AI時代の情報漏洩と仕事の変化',{originalSummary:'01:01 AI時代の情報漏洩リスク\n08:08 日本とフランスのAI政策',summary:'視聴ごとにマイルが貯まります。'});
  await enrichVideoArticles([article],{now,reviewedGuides:[],fetchImpl:async()=>new Response('<html>no captions</html>')});
  assert.match(article.summary,/説明欄のテーマ/);
  assert.match(article.summary,/字幕の内容は未確認/);
  assert.doesNotMatch(article.summary,/マイル/);
  assert.equal(article.detailedSummary,'');
  assert.deepEqual(article.videoSections,[]);
  assert.equal(article.videoChapters[0].startSeconds,61);
});
test('A news explanation beginning with a publication year is prose, not a timestamp or promotional chapter',async()=>{
  const article=video('注目AIニュースと仕事の変化',{originalSummary:'2026年10月5日〜11日の注目AIニュース19件を解説。相次ぐ情報流出を背景に、AIエージェントが普及する転換点を考えます。\n01:25 Geminiの新機能'});
  await enrichVideoArticles([article],{now,reviewedGuides:[],fetchImpl:async()=>new Response('<html>no captions</html>')});
  assert.match(article.summary,/注目AIニュース19件/);
  assert.doesNotMatch(article.summary,/説明欄のテーマ/);
});
test('Video without substantive description or captions does not pad Today when readable alternatives exist',async()=>{
  const empty=video('筆者が語るAIエージェント活用術',{originalSummary:'新刊の案内',id:'empty'});
  const metadata={videoDetails:{videoId:'abcdefghijk',shortDescription:'00:00 告知\n01:00 出版記念イベント'}};
  await enrichVideoArticles([empty],{now,reviewedGuides:[],fetchImpl:async()=>new Response(`<script>var ytInitialPlayerResponse=${JSON.stringify(metadata)};</script>`)});
  assert.equal(empty.summaryBasis,'unavailable');
  const readable=Array.from({length:3},(_,i)=>video(`ChatGPTの新機能を活用 ${i}`,{id:String(i),sourceFamily:String(i)}));
  assert.ok(!selectToday([...readable,empty],{sources:{},interests:[]},now).some(a=>a.id==='empty'));
});
