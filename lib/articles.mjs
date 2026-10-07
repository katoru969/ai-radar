import { createHash } from 'node:crypto';
import { canonicalUrl, gradeFor, TERM_NAMES, SOCIAL_TYPES, readerFit } from '../shared.js';

/** @typedef {Object} Article
 * @property {string} id
 * @property {string} title 日本語見出し。原文はoriginalTitleに保持。
 * @property {string} source
 * @property {'official'|'github'|'note'|'youtube'|'zenn'|'qiita'|'bluesky'|'hackernews'|'mastodon'} sourceType
 * @property {string} url
 * @property {string} publishedAt ISO 8601
 * @property {string} summary
 * @property {number} importanceScore
 * @property {'A'|'B'|'C'} importanceGrade
 * @property {string} whyImportant
 * @property {string} personalRelevance
 * @property {string[]} terms
 * @property {string} thumbnail
 */

export const compact = (value, limit = 140) => {
  const clean = String(value || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
};
export const isJapanese = text => /[ぁ-んァ-ヶ一-龯]/u.test(text);
export const isAI = text => /\b(ai|agi|gpt|chatgpt|claude|gemini|llms?|codex|agents?|embedding|mcp|rag|inference|manus|llama|deepseek|qwen|ollama|langchain|hugging\s?face|multimodal|diffusion)\b|人工知能|生成AI|機械学習|エージェント|自動化/i.test(text);
export function topicData(text) {
  const tests = {
    Agent: /\bagents?\b|codex|manus|エージェント|自律|自動化/i,
    MCP: /\bmcp\b|model context protocol/i,
    API: /\bapi\b|\bsdk\b|openai-python|\bcli\b|プログラミング/i,
    RAG: /\brag\b|retrieval.augmented/i,
    'Context window': /context window|context length|長い文脈|コンテキスト.*(長|量)/i,
    Embedding: /embedding|埋め込み/i,
    Inference: /\binference\b|\breasoning\b|\bmodels?\b|推論|AIモデル|最先端モデル|音声合成モデル/i,
    'Fine-tuning': /fine.tun|ファインチューニング/i,
    Multimodal: /multimodal|video|audio|image|beam|マルチモーダル|動画|画像|音声/i
  };
  const terms = TERM_NAMES.filter(term => tests[term].test(text)).slice(0, 4);
  const topics = [];
  if (/chatgpt|claude|gemini|new|release|pric|新機能|料金|無料|プラン|アップデート/i.test(text)) topics.push('新機能・料金');
  if (/how to|guide|tips|prompt|使い方|設定|活用|手順|プロンプト|コピペ/i.test(text)) topics.push('使い方・設定');
  if (/agent|workflow|productivity|codex|自動化|業務|生産性/i.test(text)) topics.push('仕事の効率化');
  if (/research|learn|education|notebooklm|perplexity|調べ|研究|論文|教育|学習/i.test(text)) topics.push('調べもの・学習');
  if (terms.includes('Multimodal')) topics.push('画像・動画');
  return { terms, topics };
}
export function importance(title, description, sourceType, publishedAt, now = Date.now()) {
  const text = `${title} ${description}`;
  const fit = readerFit({originalTitle:title,originalSummary:description});
  let score = sourceType === 'official' ? 67 : sourceType === 'github' ? 52 : SOCIAL_TYPES.includes(sourceType) ? 48 : 57;
  score += fit.priority;
  if (/活用|使い方|how to|tutorial|設定|プロンプト/i.test(title)) score += 4;
  if (/advertis|partner|contest|keynote|winning|trailer|コンテスト|受賞|周年/i.test(title)) score -= 7;
  const age = (now - Date.parse(publishedAt)) / 86400000;
  score += age <= 3 ? 8 : age <= 7 ? 5 : age <= 14 ? 2 : 0;
  const ceiling = SOCIAL_TYPES.includes(sourceType) ? 71 : ['zenn','qiita','youtube'].includes(sourceType) ? 84 : 98;
  return Math.max(0, Math.min(ceiling, score));
}
const translatedTopics = [
  ['cyber verification program','サイバー検証プログラム'],
  ['life sciences verification program','生命科学の検証プログラム'],
  ['quant research','定量研究'], ['quantitative research','定量研究'],
  ['prompt caching','プロンプトのキャッシュ'], ['computer use','コンピュータ操作'],
  ['AI research','AI研究'], ['research','研究'], ['operations','業務'],
  ['client experience','顧客体験'], ['coding','コーディング'],
  ['AI safety','AIの安全性'], ['cybersecurity','サイバーセキュリティ'],
  ['security','セキュリティ'], ['productivity','生産性']
];
function translatedTopic(topic) {
  let result = topic.replace(/^(?:the|an?|our)\s+/i,'').trim();
  for (const [english,japanese] of translatedTopics) result = result.replace(new RegExp(`\\b${english}\\b`,'gi'),japanese);
  return compact(result,80);
}
function japaneseExcerpt(description) {
  const sentences = description.split(/(?<=[。！？])/u).map(value => value.trim()).filter(Boolean);
  const meaningful = sentences.filter(value => value.length >= 30 && isJapanese(value) && !/^(?:はじめに\s*)?(?:こんにちは|はじめまして)/u.test(value));
  const relevant = meaningful.find(value => isAI(value) || /実装|手法|特徴|対応|比較|改善|課題/u.test(value));
  return compact(relevant || meaningful[0] || sentences[0] || description,140);
}
// 未知の英文を翻訳したふりはせず、原題とフィード抜粋を保持します。
// 完全な日本語翻訳・要約は、後からsummarizer providerに委譲できます。
export function japaneseGuide(article) {
  const { originalTitle: title, originalSummary: description, source, sourceType } = article;
  const text = `${title} ${description}`;
  let heading, summary;
  if (SOCIAL_TYPES.includes(sourceType)) {
    const typeLabel = sourceType === 'hackernews' ? '話題の記事' : '投稿';
    heading = isJapanese(title) ? compact(title,100) : `${source}：${article.terms[0] || 'AI'}の${typeLabel}`;
    summary = isJapanese(description) ? japaneseExcerpt(description) : `${source}で「${compact(title,100)}」が共有されています。詳しい内容は原文で確認できます。`;
  } else if (isJapanese(title)) {
    heading = compact(title, 100);
    summary = isJapanese(description) ? japaneseExcerpt(description) : `${source}が「${compact(title, 90)}」を公開しました。`;
  } else if (sourceType === 'github') {
    heading = `${source} ${compact(title, 30)} をリリース`;
    const feature = /features?|added|add support/i.test(description), fix = /bug fixes|fixed|fix:/i.test(description);
    summary = `${source}の${compact(title, 25)}が公開されました。${feature && fix ? '機能追加と不具合修正が含まれます。' : feature ? '機能追加が含まれます。' : fix ? '不具合修正が含まれます。' : '変更内容は原文のリリースノートで確認できます。'}`;
  } else if (/text provenance|watermark/i.test(text)) {
    heading = `${source}、AI生成文の識別に関する方針を公開`;
    summary = `${source}が、AI生成文の透かしや検出について方針を説明しています。${/EU/.test(text) ? 'EUの規則への対応がテーマです。' : ''}`;
  } else if (/model guide|models.*guide|guide.*models/i.test(title)) {
    const model = title.match(/GPT[- ]\d+(?:\.\d+)?|Gemini\s*\d+(?:\.\d+)?|Claude/i)?.[0] || 'AIモデル';
    heading = `${source}、${model}の選び方ガイドを公開`;
    summary = `${model}のモデル選びについて、公式ガイドが公開されました。${/reasoning effort/i.test(description) ? '推論の設定' : '設定'}${/prompts?/i.test(description) ? 'や指示の書き方' : ''}を確認できます。`;
  } else if (/latest AI news|AI updates.*(month|September|October)/i.test(title)) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const month = months.findIndex(name => title.includes(name));
    heading = `${source}、${month >= 0 ? `${month + 1}月の` : '最近の'}AI更新をまとめて公開`;
    summary = `${source}が${month >= 0 ? `${month + 1}月に発表した` : '最近発表した'}AI関連の更新をまとめています。気になる機能を公式の情報から振り返れます。`;
  } else if (/new codex cli/i.test(title)) {
    heading = `${source}、新しいCodex CLIを紹介`;
    summary = '開発作業を支援するCodex CLIの新しい紹介動画が公開されました。具体的な使い方は公式動画で確認できます。';
  } else if (/train.*engineers/i.test(title)) {
    const engineers = title.match(/([\d,]+) engineers/i)?.[1];
    heading = `${source}、${engineers ? `${engineers}人の` : ''}エンジニア育成を発表`;
    summary = `${source}が企業のAI人材育成に関する取り組みを発表しました。${engineers ? `タイトルでは${engineers}人のエンジニア育成を掲げています。` : ''}`;
  } else if (/^expanding /i.test(title)) {
    const subject = translatedTopic(title.replace(/^expanding /i,''));
    heading = `${source}、${subject}を拡大`;
    summary = `${source}が「${subject}」の拡大について発表しました。対象や利用条件は原文で確認できます。`;
  } else if (/^how (.+?) is scaling (.+?) with (.+)$/i.test(title)) {
    const [,company,topic,tool] = title.match(/^how (.+?) is scaling (.+?) with (.+)$/i);
    const translated = translatedTopic(topic);
    heading = `${company}、${tool}を使う${translated}の事例`;
    summary = `${company}が${tool}を使って${translated}を拡大する事例を、${source}が紹介しています。`;
  } else if (/^introducing |^meet (?:the )?(?:all )?(?:new )?/i.test(title)) {
    const product = compact(translatedTopic(title.replace(/^introducing |^meet (?:the )?(?:all )?(?:new )?/i, '').replace(/[.!]$/, '')),65);
    heading = `${source}、${product}を紹介`;
    summary = sourceType === 'youtube' ? `公式動画で「${product}」の概要が紹介されています。具体的な使い方は動画で確認できます。` : `${source}が「${product}」について公開しました。提供範囲や利用条件は原文で確認できます。`;
  } else {
    heading = `${source}：${compact(title,80)}`;
    summary = `「${compact(title, 105)}」が公開されました。詳しい内容は原文で確認できます。`;
  }
  let whyImportant = sourceType === 'official' ? '公式の変更点を知ることで、AIツールを選ぶ判断材料になります。' : 'AIの使い方や周辺情報を知ることで、活用を考える材料になります。';
  let personalRelevance = '使っているAIや気になる機能の提供条件を確認するきっかけになります。';
  if (article.terms.includes('Agent')) {
    whyImportant = '複数の作業をAIに任せる仕組みを知ることで、自動化を検討しやすくなります。';
    personalRelevance = '繰り返している情報収集や資料作成に使えそうか、利用例を確認できます。';
  } else if (article.topics.includes('調べもの・学習')) {
    whyImportant = 'AIの研究や実際の応用を知ることで、活用の可能性を考えられます。';
    personalRelevance = '調査や論文の整理で使えるか、原文の条件や根拠を確認できます。';
  } else if (article.topics.includes('使い方・設定')) {
    whyImportant = 'AIの学び方やモデル選びの基準を知る材料になります。';
    personalRelevance = '今使っているモデルや指示の出し方を見直す参考にできます。';
  } else if (article.terms.includes('Multimodal')) {
    whyImportant = '文章以外の情報をAIで扱う用途を知る材料になります。';
    personalRelevance = '画像・動画・音声を使う場面で、対応形式や利用条件を確認できます。';
  }
  if (SOCIAL_TYPES.includes(sourceType)) whyImportant = 'コミュニティの解説や反応を、公式発表とあわせて理解する参考になります。';
  else if (['zenn','qiita'].includes(sourceType)) whyImportant = '個人・企業による実践や解説を知り、自分の用途で試す参考にできます。';
  const fit = readerFit(article);
  if (fit.category === '料金・利用条件') {
    whyImportant = '料金や利用上限の変更は、今のプランを続けるかどうかの判断に関係します。';
    personalRelevance = '契約を変える前に、対象プラン・日本での提供状況・追加費用を原文で確認できます。';
  } else if (/音声ファイル|録音|議事録|自動メモ/u.test(title)) {
    whyImportant = '録音の確認やメモ作成にかかる手間を減らせるか、具体的に検討できる情報です。';
    personalRelevance = '会議や面談の記録を整理することが多ければ、自分のプランでの対応と使い方を確認できます。';
  } else if (fit.category === '使い方・設定') {
    whyImportant = '具体的な手順があると、いつものAIで試せるか判断しやすくなります。';
    personalRelevance = '普段の調べものや資料作成に使えそうなら、紹介された設定や指示をひとつ試せます。';
  }
  return { title: heading, summary: compact(summary, 160), whyImportant, personalRelevance, summaryMode: 'rules' };
}
export function createArticle({title, url, date, description = '', thumbnail = '', datePrecision = 'datetime', source}, now = Date.now()) {
  const cleanUrl = canonicalUrl(url), timestamp = Date.parse(date);
  if (!title || !cleanUrl || !Number.isFinite(timestamp) || timestamp > now + 5 * 60000) return null;
  if (source.aiOnly && !isAI(`${title} ${description.slice(0, 600)}`)) return null;
  const publishedAt = new Date(timestamp).toISOString();
  const originalTitle = compact(title, 300), originalSummary = String(description).split(/\r?\n/u).map(line => compact(line,1800)).filter(Boolean).join('\n').slice(0,1800);
  const importanceScore = importance(originalTitle, originalSummary, source.sourceType, publishedAt, now);
  const article = {
    id: createHash('sha256').update(cleanUrl).digest('hex').slice(0, 20),
    source: source.name, sourceId: source.id, sourceFamily: source.family || source.name,
    sourceType: source.sourceType, url: cleanUrl, publishedAt, publishedAtPrecision:datePrecision, originalTitle, originalSummary,
    importanceScore, importanceGrade: gradeFor(importanceScore),
    ...topicData(`${originalTitle} ${originalSummary}`), thumbnail: canonicalUrl(thumbnail),readerCategory:readerFit({originalTitle,originalSummary}).category
  };
  return { ...article, ...japaneseGuide(article) };
}
