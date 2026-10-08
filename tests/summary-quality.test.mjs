import test from 'node:test';
import assert from 'node:assert/strict';
import {extractiveSummary} from '../lib/reader-summary.mjs';

test('The digest keeps the feature, practical method and important plan limitations together',() => {
  const sentences = [
    'ChatGPTで音声ファイルをアップロードして議事録を作る新機能が発表されました。',
    '長い録音から決定事項と担当者を抽出し、フォローアップメールの下書きも作成できます。',
    '使いたい録音を添付ボタンからアップロードし、決定事項を整理してくださいと入力します。',
    '音声アップロードは有料プランが対象で、無料プランでは利用できません。',
    'ただし、対象プランでも順次提供となり、全員に同時に表示されるとは限りません。',
    '生成した議事録は元の録音と照合して、誤認識や担当者を確認してください。'
  ];
  const result = extractiveSummary(sentences.join('\n'));
  assert.match(result.summary,/新機能/); assert.match(result.summary,/無料プランでは利用できません/);
  assert.match(result.detailedSummary,/添付ボタン/); assert.match(result.detailedSummary,/順次提供/);
  for (const sentence of result.detailedSummary.split(/\n/).join('').match(/[^。]+。/g)) assert.ok(sentences.includes(sentence));
  assert.doesNotMatch(result.detailedSummary,/980円|iPhone限定|すべて無料|…/);
});

test('Quoted questions and dependent fragments never become an isolated overview',() => {
  const result = extractiveSummary('「ChatGPTにパスワードを覚えてもらった方が楽なのでは？」という疑問が寄せられています。\nChatGPTでアカウントの安全な使い方を確認する手順を紹介します。\nそれでも、パスワードやAPIキーを会話に保存する使い方はおすすめできません。\nAIには手順の整理を任せ、実際の設定と共有範囲は自分で確認してください。');
  assert.ok(result); assert.doesNotMatch(result.summary,/楽なのでは|^それでも|「[^」]*$/);
  assert.match(result.summary,/安全な使い方/);
  if (result.detailedSummary.includes('それでも')) assert.ok(result.detailedSummary.includes('手順を紹介します。'));
});

test('Oversized prose is not cut mid-sentence to meet the summary budget',() => {
  const result = extractiveSummary(`ChatGPTの新機能を使って資料を整理する具体的な操作手順${'を説明するための文章'.repeat(90)}。\nChatGPTで資料をアップロードして内容を質問できる新機能が追加されました。\n利用する前に自分のプランの上限と対象となるファイル形式を確認してください。`);
  assert.ok(result); assert.doesNotMatch(result.summary,/…/); assert.doesNotMatch(result.detailedSummary,/…/);
  assert.match(result.summary,/質問できる新機能/); assert.match(result.summary,/[。！]$/u);
});
