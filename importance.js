// Shared, deterministic rules. Personal settings stay on the device; no chat history is input.
export const IMPORTANCE_VERSION = 2;
export const WORK_PRIORITIES = {research:'論文・情報の整理',documents:'資料・文章作成',automation:'作業の自動化',media:'画像・動画の活用'};
export const DEFAULT_WORK_PRIORITIES = ['research','documents','automation'];
export const GRADE_LABELS = {A:'自分に重要',B:'試す価値あり',C:'参考情報'};
export const gradeFor = score => score>=85 ? 'A' : score>=60 ? 'B' : 'C';
export function normalizeWorkPriorities(value) {
  return Array.isArray(value) ? [...new Set(value.filter(key=>Object.hasOwn(WORK_PRIORITIES,key)))] : [...DEFAULT_WORK_PRIORITIES];
}
const domains = {
  research:/論文|文献|pubmed|zotero|notebook\s?lm|perplexity|deep research|リサーチ|情報収集|調査レポート|PDF|知識管理|obsidian|ノート整理|出典|根拠を確認|literature|papers?\b|research (?:report|assistant|workflow)/iu,
  documents:/資料|スライド|プレゼン|powerpoint|pptx|excel|表計算|スプレッドシート|報告書|申請書|抄録|原稿|執筆|文章作成|文書|word\b|docx|図解|図表|校正|翻訳|英語|レポート|slides?|spreadsheet|documents?|writing/iu,
  automation:/自動化|AI秘書|繰り返し.*(?:作業|業務)|定期.*(?:収集|実行|調査|配信)|業務ワークフロー|フォルダ.*整理|ファイル整理|gmail|google (?:drive|workspace)|予定.*(?:確認|管理|登録)|議事録|automation|(?:scheduled|daily|document) (?:task|workflow)|\bdots\b|\bmanus\b/iu,
  media:/動画|映像|画像|音声|録音|字幕|編集|文字起こし|multimodal|video|image|audio/iu
};
const practical = /手順|操作|使い方|活用|実演|添付|アップロード|選択|入力|クリック|連携|設定|依頼|指示|比較|使い分け|試した|検証|how to|using|hands.on/iu;
const materialChange = /料金|価格|値上げ|値下げ|課金|利用枠|上限|制限|契約|プラン|privacy|データ.*(?:保存|学習|送信|利用)|情報漏洩|外部送信|安全.*設定|security|subscription|pricing|usage limit/iu;
const importantChange = /新機能|新モデル|新しい|追加|公開|発表|アップデート|提供開始|利用でき|できるよう|使える|対応|生成|作成|整理|改善|効率|時短|常時|まとめ|カスタマイズ|比較|launch|introduc|update|release|new\b|available/iu;
const developerOnly = /\bapi\b|\bsdk\b|\bcli\b|python|typescript|javascript|kubernetes|docker|\badk\b|agent development kit|ハッカソン|MCP Events|インフラ|サーバー実装|環境構築|ベンチマーク|benchmark|エンドポイント|ファインチューニング/iu;
const headlineHype = /最強|神機能|衝撃|革命|世界(?:一|No\.?\s?1)|爆誕|驚愕|人類滅亡|覇権|world(?:'s)? best/iu;
const futureOnly = /提供予定|公開予定|近日(?:公開|提供)|まもなく展開|(?:提供|公開|開始).{0,15}(?:時期|日程).{0,20}(?:未定|未発表|明かされていません)|将来.*(?:できる|可能)|coming soon|not yet available/iu;
const weakSourceText = /説明欄のテーマ|字幕の内容は未確認|説明欄だけでは|元動画で確認|日本語の本文を確認でき|新機能を解説します|紹介します[。.!]?$/u;

export function evaluateImportance(article,{now=Date.now(),workPriorities}={}) {
  const priorities=normalizeWorkPriorities(workPriorities);
  const title=String(article.originalTitle || article.title || '').normalize('NFKC').slice(0,500);
  const excerpt=String(article.originalSummary || '').slice(0,1800);
  // Generic editorial hints and chapter labels are not evidence of a practical workflow.
  const detail=article.summaryBasis==='video-description' ? excerpt : String(article.detailedSummary || '').slice(0,650);
  const cleaned=excerpt.split('\n').filter(line=>!/^\s*\d{1,2}:\d{2}(?::\d{2})?\s/.test(line) && !/チャンネル登録|無料セミナー|プレゼント|公式LINE/.test(line)).join('\n');
  const body=`${cleaned} ${article.summaryBasis==='video-description' ? '' : detail}`;
  const text=`${title} ${body}`;
  const matches=priorities.filter(key=>domains[key].test(text));
  const titleMatches=matches.filter(key=>domains[key].test(title));
  const familiar=/chatgpt|claude|gemini|codex|notebook\s?lm|\bdots\b|openai/iu.test(text);
  const primary=/chatgpt|claude|gemini|codex|openai/iu.test(title);
  const practicalTitle=practical.test(title),practicalBody=practical.test(body);
  const confirmedVideo=article.summaryBasis==='video-transcript' && article.transcriptStatus==='available';
  const confirmedBody=article.summaryBasis==='article' || confirmedVideo;
  const bodyAvailable=body.trim().length>=100 && !weakSourceText.test(body.trim());
  const limitedApplication=/ハンズオンではなく|(?:構築|操作|実装)方法.{0,15}(?:全手順|すべて).{0,20}(?:未公開|公開されていません)|(?:利用ツール|完成.*指示文).{0,25}公開されていません/u.test(body);
  const steps=confirmedVideo && !limitedApplication && article.videoSections?.some(section=>section.steps?.length>=2);
  const actionableBody=bodyAvailable && practicalBody && !limitedApplication;
  const directChange=primary && materialChange.test(title) && bodyAvailable;
  const titleDeveloper=developerOnly.test(title);
  const developerTerms=[...new Set((text.match(/\bapi\b|\bsdk\b|python|typescript|javascript|kubernetes|docker|エンドポイント|環境構築|コーディング|実装|ベンチマーク/giu) || []).map(value=>value.toLowerCase()))];
  const developerAudience=/開発者|エンジニア|API.{0,25}(?:送信|入力|エンドポイント)|(?:入力|出力).{0,10}(?:100\s*万|百万|million).{0,6}トークン|100\s*万.{0,6}(?:入力|出力)トークン|MCPサーバー|コーディングパイプライン|ソースコード.{0,15}(?:読み込み|実装)|gemini-\d/iu.test(text);
  const developerContent=titleDeveloper || developerTerms.length>=3 || developerAudience;
  const delegatedWork=/論文|文献|PDF|資料|スライド|文章作成|文書|フォルダ.*整理|ファイル整理|obsidian/iu.test(title) && /AI.{0,15}(?:任せ|依頼)|(?:codex|claude code|chatgpt).{0,30}(?:頼|依頼|指示|任せ)/iu.test(text);

  let relevance=matches.length ? titleMatches.length ? 34 : confirmedBody && actionableBody ? 31 : 24 : familiar ? 16 : 6;
  if (matches.length>=2) relevance+=3;
  if (matches.length && familiar) relevance+=3;
  if (directChange) relevance=Math.max(relevance,36);
  relevance=Math.min(40,relevance);
  let action=steps ? 25 : confirmedBody && actionableBody ? 22 : actionableBody && practicalTitle ? 20 : bodyAvailable && practicalBody ? 16 : practicalTitle ? 10 : 6;
  if (directChange) action=Math.max(action,22);
  let impact=directChange ? 20 : matches.length && practicalTitle && practicalBody ? 18 : matches.length && importantChange.test(text) && bodyAvailable ? 17 : importantChange.test(title) ? 13 : matches.length ? 12 : 7;
  const evidence=confirmedBody && bodyAvailable ? 10 : article.sourceType==='official' && bodyAvailable ? 9 : bodyAvailable ? 7 : article.sourceType==='official' ? 5 : 3;
  const age=(now-Date.parse(article.publishedAt))/86400000;
  const freshness=Number.isFinite(age) && age>=-5/1440 ? age<=3 ? 5 : age<=7 ? 4 : age<=14 ? 2 : age<=30 ? 1 : 0 : 0;
  const limitations=[];
  let ceiling=100;
  if (developerContent && !(delegatedWork && !titleDeveloper && !developerAudience) && !/ノーコード|コード不要|コピペ|without coding/iu.test(title)) {ceiling=59;limitations.push('開発やAPI実装が中心');}
  if (/超初心者|完全初心者|入門|基礎を|基本操作/iu.test(title) && !/脱初心者/iu.test(title)) {ceiling=Math.min(ceiling,59);limitations.push('基礎的な内容が中心');}
  if (/BTS|ファン向け|推し活|ゲーム実況|AI美女|美少女/iu.test(title)) {ceiling=Math.min(ceiling,59);limitations.push('主な仕事との関係が薄い');}
  if (/Android(?:専用|限定)|(?:高齢者|初心者).*(?:シンプルガイド|操作ガイド)/iu.test(title) && !/iPhone|iOS/iu.test(text)) {ceiling=Math.min(ceiling,59);limitations.push('iPhoneでの自分の利用に直結しにくい');}
  if (futureOnly.test(title) || futureOnly.test(body)) {ceiling=Math.min(ceiling,84);limitations.push('一部の機能は提供時期が未確定');}
  if (limitedApplication) {ceiling=Math.min(ceiling,84);limitations.push('実例の再現に必要な手順・条件が未公開');}
  if (/学生|大学生|転職活動|職務経歴書|面接対策/u.test(title+' '+body.slice(0,250))) {ceiling=Math.min(ceiling,84);limitations.push('特定の立場・用途が前提');}
  if (!matches.length && !directChange) {ceiling=Math.min(ceiling,84);limitations.push('優先する仕事との直接のつながりが弱い');}
  if (article.sourceType==='youtube' && !confirmedVideo) {ceiling=Math.min(ceiling,84);limitations.push('動画の中身は説明欄で確認できた範囲');}
  if (evidence<7) {ceiling=Math.min(ceiling,59);limitations.push('判断に必要な具体的情報が不足');}
  if (headlineHype.test(title) && !bodyAvailable) limitations.push('見出しの強い表現だけでは加点しない');
  if (!directChange && (relevance<34 || action<20 || impact<16 || evidence<7)) ceiling=Math.min(ceiling,84);
  if (!directChange && matches.length && !titleMatches.length && !/notebook\s?lm|obsidian|zotero/iu.test(title)) {ceiling=Math.min(ceiling,84);limitations.push('優先分野は記事の一部分で、主題としての実用性は未確認');}
  const factors={relevance,action,impact,evidence,freshness};
  const score=Math.min(ceiling,Object.values(factors).reduce((total,value)=>total+value,0));
  const grade=gradeFor(score),area=matches.map(key=>WORK_PRIORITIES[key]).join('・');
  const main=directChange ? '普段使うAIの料金・利用条件・データの扱いを見直す判断材料です。' : area ? `${area}に関係する情報です。` : familiar ? '普段使うAIの情報ですが、優先する仕事への具体的な効果は限定的です。' : '周辺の動向を知るための情報です。';
  const reason=grade==='A' ? `${main}${steps ? '具体的な操作・実例を確認でき、試す価値が高いためAです。' : '使い方や変更内容を確認でき、今の作業や判断への影響が大きいためAです。'}` : `${main}${limitations.length ? limitations.slice(0,2).join('。')+'。' : grade==='B' ? '用途に合うか試す候補です。' : '今すぐ行動を変える材料は少なく、参考として扱います。'}`;
  return {importanceVersion:IMPORTANCE_VERSION,importanceScore:score,importanceGrade:grade,importanceReason:reason.slice(0,240),importanceFactors:factors,importanceAreas:matches,importanceLimits:limitations.slice(0,3)};
}
