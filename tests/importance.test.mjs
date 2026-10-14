import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateImportance,DEFAULT_WORK_PRIORITIES,gradeFor} from '../importance.js';
import {normalizePreferences,readerFit,selectToday} from '../shared.js';
import {sanitizeSnapshot} from '../lib/snapshot.mjs';
import {collectFeed} from '../lib/collect-feed.mjs';

const now=Date.parse('2026-10-14T06:00:00Z');
const article=(overrides={})=>({id:'example',title:'ChatGPTで論文PDFを整理する手順',originalTitle:'ChatGPTで論文PDFを整理する手順',source:'Example',sourceFamily:'Example',sourceType:'official',url:'https://example.com/article',publishedAt:'2026-10-13T06:00:00Z',originalSummary:'',summaryBasis:'article',detailedSummary:'論文のPDFを添付し、知りたい項目と出典を付けるよう指示します。出力された引用を原文と照合して、読み落としを確認します。比較する項目を指定して、複数の文献を表にまとめる操作を実演しています。既存の利用者が設定画面から選んで使える方法で、コードや追加のAPIキーは必要ありません。',topics:[],...overrides});
const assess=(value,options={})=>evaluateImportance(value,{now,...options});

test('The three confirmed work priorities have equal weight and preserve existing settings',()=>{
  assert.deepEqual(normalizePreferences().workPriorities,DEFAULT_WORK_PRIORITIES);
  const saved={interests:['使い方・設定'],sources:{youtube:false},notifications:{digest:true},understood:['MCP']};
  const migrated=normalizePreferences(saved);
  assert.deepEqual(migrated.workPriorities,DEFAULT_WORK_PRIORITIES);
  assert.deepEqual(migrated.interests,saved.interests);
  assert.equal(migrated.sources.youtube,false);
  assert.equal(migrated.notifications.digest,true);
  assert.deepEqual(migrated.understood,['MCP']);
  const scores=[['research','論文PDFを整理'],['documents','スライド資料を作成'],['automation','議事録を自動化']].map(([priority,task])=>assess(article({originalTitle:`ChatGPTで${task}する手順`,detailedSummary:'対象のデータを添付し、出力の形式を指示します。設定を選択して結果を作成したら、元データと照合して確認します。毎回の入力を省くために、繰り返しの作業では同じ依頼の条件を保存できます。この操作を使う際の条件と、失敗した場合の修正方法も実演しています。'}),{workPriorities:[priority]}).importanceScore);
  assert.equal(new Set(scores).size,1);
});

test('A means a verified practical benefit to priority work, with bounded explainable factors',()=>{
  const result=assess(article());
  assert.equal(result.importanceGrade,'A');
  assert.equal(result.importanceVersion,2);
  assert.deepEqual(result.importanceAreas,['research']);
  assert.match(result.importanceReason,/論文・情報の整理/);
  assert.equal(Object.values(result.importanceFactors).reduce((a,b)=>a+b,0),result.importanceScore);
  for(const [key,max] of Object.entries({relevance:40,action:25,impact:20,evidence:10,freshness:5}))assert.ok(result.importanceFactors[key]>=0 && result.importanceFactors[key]<=max,key);
  assert.deepEqual([gradeFor(85),gradeFor(84),gradeFor(60),gradeFor(59)],['A','B','B','C']);
});

test('Confirmed practical YouTube can be A; unconfirmed descriptions and chapters cannot',()=>{
  const video=article({sourceType:'youtube',summaryBasis:'video-transcript',transcriptStatus:'available',videoSections:[{title:'文献の比較',steps:['PDFを添付する','出典を照合する']}]});
  assert.equal(assess(video).importanceGrade,'A');
  const unconfirmed=assess({...video,summaryBasis:'video-description',transcriptStatus:'unavailable',originalSummary:video.detailedSummary});
  assert.notEqual(unconfirmed.importanceGrade,'A');
  assert.match(unconfirmed.importanceLimits.join(' '),/説明欄/);
  assert.equal(assess({...video,summaryBasis:'video-description',originalSummary:'00:00 論文PDF整理の手順\n01:00 APIの紹介\n02:00 資料作成\n公式LINEで無料セミナーをプレゼント'}).importanceGrade,'C');
});

test('Publisher and social popularity do not make an otherwise identical confirmed article more important',()=>{
  const scores=['official','note','youtube','zenn','bluesky','hackernews'].map(sourceType=>assess(article({sourceType,summaryBasis:sourceType==='youtube'?'video-transcript':'article',transcriptStatus:'available',socialMetrics:{likes:99999,points:99999}})).importanceScore);
  assert.equal(new Set(scores).size,1);
});

test('Generic familiar-model announcements and title hype do not become A',()=>{
  for(const title of ['Introducing Gemini: a new model','【衝撃】世界No.1の最強ChatGPTが爆誕','ChatGPTがBTSファン向けの新機能を発表'])assert.notEqual(assess(article({originalTitle:title,summaryBasis:'feed',detailedSummary:'',originalSummary:'A new AI model is announced.'})).importanceGrade,'A',title);
  const generic=assess(article({originalTitle:'新しいGeminiモデルを発表',detailedSummary:'新しいモデルの性能を発表しました。資料作成や論文整理にも役立つ可能性があると紹介しています。詳しい提供条件や使い方は確認できず、発表された性能の数字を中心にしたニュースです。これまでのモデルを超えるとする宣伝の表現があるため、実際の仕事で効果があるかは別に試す必要があります。'}));
  assert.notEqual(generic.importanceGrade,'A');
});

test('Actual consumer pricing and data-handling changes can be A without a work keyword',()=>{
  for(const title of ['ChatGPTの利用上限と料金を変更','Claudeのデータ学習設定を変更']){
    const change=assess(article({originalTitle:title,detailedSummary:'個人向けプランの利用条件が本日から変わります。既存の利用者も対象で、設定画面から現在の契約と変更後の条件を確認できます。変更を希望する場合の操作と、変更しない場合の扱いが明示されています。利用する前に契約内容とデータを送る設定を確認して、継続するか判断するための情報です。'}));
    assert.equal(change.importanceGrade,'A',title);
  }
});

test('Engineering, token pricing and hackathons remain C despite task keywords in the body',()=>{
  for(const title of ['Gemini APIの料金を変更','ADKでAIエージェントを作る','ハッカソンでChatGPTアプリを実装','Pythonで論文PDFを整理する手順']){
    const item=article({originalTitle:title});assert.equal(assess(item).importanceGrade,'C',title);
    assert.equal(readerFit(item).eligible,false,title);
  }
  const api=article({originalTitle:'Gemini新モデルを発表',detailedSummary:'新モデルは企業向けの文章作成ワークフローに対応します。100万入力トークンあたり2ドルのAPI価格で、調査レポートを作るためのコードに組み込むことができます。APIへの送信には開発者による実装が必要です。新モデルは一般ユーザーのアプリから選べるという情報はありません。'});
  assert.equal(assess(api).importanceGrade,'C');
  assert.equal(readerFit(api).eligible,false);
});

test('An API discount in a mixed roundup does not become a consumer plan change',()=>{
  const roundup=article({originalTitle:'ChatGPTの新機能とClaude料金10分の1：今週のAIニュース',sourceType:'qiita',detailedSummary:'今週のAIニュースをまとめます。Claude HaikuのAPI料金が10分の1になりました。文章作成や情報整理にも使えるAIとの連携も紹介しています。文書の横でAIに依頼する方法や、設定を見直すための情報を整理しました。会社で利用するときは管理者の許可が必要で、二段階認証の設定も勧めています。'});
  const result=assess(roundup);
  assert.notEqual(result.importanceGrade,'A');
  assert.doesNotMatch(result.importanceReason,/普段使うAIの料金・利用条件/);
});

test('AI delegation for documents is allowed while environment setup and source-code work stay excluded',()=>{
  const delegated=article({originalTitle:'Codexに論文PDFの整理を依頼する手順'});
  assert.equal(readerFit(delegated).eligible,true);
  assert.equal(assess(delegated).importanceGrade,'A');
  for(const title of ['Claude Codeの環境構築と仕事術','CodexでAPIを実装して論文を整理'])assert.equal(readerFit(article({originalTitle:title})).eligible,false,title);
});

test('Future releases, limited eligibility and unreproducible custom demos are B at most',()=>{
  for(const value of [
    article({detailedSummary:article().detailedSummary+' 一般提供の日程は明かされていません。coming soonとしています。'}),
    article({originalTitle:'学生限定Geminiプランの料金を変更'}),
    article({sourceType:'youtube',summaryBasis:'video-transcript',transcriptStatus:'available',detailedSummary:article().detailedSummary+' 構築方法の全手順は公開されていません。',videoSections:[{steps:['予定を依頼する','資料を作る']}]})
  ])assert.notEqual(assess(value).importanceGrade,'A');
});

test('Editorial hints and promotional description keywords never supply fake relevance',()=>{
  const base=article({originalTitle:'最新のAIニュース',summaryBasis:'video-description',sourceType:'youtube',originalSummary:'',detailedSummary:''});
  const edited={...base,whyImportant:'論文・PDF整理やスライド資料作成と自動化に役立つ',personalRelevance:'Obsidianの論文整理の手順です。',originalSummary:'公式LINEで論文PDFの整理、スライド資料作成、自動化の無料セミナーをプレゼント'};
  assert.equal(assess(base).importanceScore,assess(edited).importanceScore);
});

test('Device priority changes immediately regrade even legacy bookmarked scores without mutating the saved article',()=>{
  const saved=article({importanceScore:99,importanceGrade:'A',importanceVersion:0});
  const copy=structuredClone(saved);
  assert.equal(assess(saved,{workPriorities:['research']}).importanceGrade,'A');
  assert.notEqual(assess(saved,{workPriorities:['media']}).importanceGrade,'A');
  assert.notEqual(assess(saved,{workPriorities:[]}).importanceGrade,'A');
  assert.deepEqual(saved,copy);
});

test('Freshness has only five points and does not determine personal relevance',()=>{
  const current=assess(article()),older=assess(article({publishedAt:'2026-09-25T06:00:00Z'}));
  assert.equal(older.importanceGrade,'A');
  assert.equal(current.importanceScore-older.importanceScore,4);
  assert.equal(assess(article({publishedAt:'unknown'})).importanceFactors.freshness,0);
});

test('Today uses ten A/B candidates before low relevance C padding with longer summaries',()=>{
  const useful=Array.from({length:10},(_,index)=>({...article({id:`useful-${index}`,sourceFamily:`family-${index}`,publishedAt:'2026-10-07T06:00:00Z',detailedSummary:'具体的に使える情報です。',importanceScore:70,summaryBasis:'feed'})}));
  const low=article({id:'low',importanceScore:30});
  const today=selectToday([...useful,low],normalizePreferences(),now);
  assert.equal(today.length,10);assert.ok(today.every(value=>value.id!=='low'));
});

test('Published evaluation data is bounded and does not include user profile or private chat inputs',()=>{
  const item={...article(),...assess(article()),importanceReason:'x'.repeat(1000),importanceFactors:{relevance:999,action:-1,impact:100,evidence:50,freshness:50},importanceAreas:['research','private-chat','research'],workPriorities:['research'],privateChat:'secret',userName:'private'};
  const output=sanitizeSnapshot({articles:[item],generatedAt:new Date(now).toISOString(),privateChat:'secret'});
  assert.equal(output.articles[0].importanceReason.length,240);
  assert.deepEqual(output.articles[0].importanceFactors,{relevance:40,action:0,impact:20,evidence:10,freshness:5});
  assert.deepEqual(output.articles[0].importanceAreas,['research']);
  assert.ok(!JSON.stringify(output).includes('secret'));
  assert.ok(!Object.hasOwn(output.articles[0],'workPriorities'));
});

test('The collection pipeline evaluates after summaries and publishes a reproducible rule version',async()=>{
  const source={id:'example',name:'Example',family:'Example',sourceType:'official',url:'https://example.com/feed'};
  const rss=`<rss><channel><item><title>${article().originalTitle}</title><link>https://example.com/article</link><pubDate>Tue, 13 Oct 2026 06:00:00 GMT</pubDate><description>${article().detailedSummary}</description></item></channel></rss>`;
  const result=await collectFeed({rss:[source]},{now,fetchImpl:async(url,options)=>{assert.ok(!options?.headers?.Authorization);assert.equal(url,source.url);return new Response(rss);}});
  assert.equal(result.articles.length,1);
  assert.equal(result.articles[0].importanceVersion,2);
  assert.equal(result.articles[0].importanceScore,assess(result.articles[0]).importanceScore);
  assert.equal(result.generatedAt,new Date(now).toISOString());
});
