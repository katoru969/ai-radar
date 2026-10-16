import test from 'node:test';
import assert from 'node:assert/strict';
import {createReaderSession,readerPage,focusReaderArticle,tokyoDay,readerTitle,summaryPoints} from '../reader-session.js';

const candidates = Array.from({length:15},(_,index) => ({id:String(index + 1),title:`仕事に使えるAI ${index + 1}`,importanceGrade:index < 2 ? 'A' : index < 7 ? 'B' : 'C'}));

test('A reading batch has ten distinct articles and keeps the selected order and actual grades',() => {
  const session = createReaderSession([candidates[0],...candidates],'batch');
  assert.equal(session.articles.length,10);
  assert.deepEqual(session.articles.map(article => article.id),candidates.slice(0,10).map(article => article.id));
  assert.deepEqual(session.articles.map(article => article.importanceGrade),['A','A','B','B','B','B','B','C','C','C']);
  assert.equal(readerPage(session).position,1);
});

test('Understanding advances in the fixed batch, without filling its place with a newly selected candidate',() => {
  const session = createReaderSession(candidates,'batch');
  const next = readerPage(session,['1']);
  assert.equal(next.article.id,'2');assert.equal(next.position,2);assert.equal(next.total,10);assert.equal(next.unread.length,9);
  assert.equal(next.previousId,null);assert.equal(next.nextId,'3');
  const finished = readerPage(session,candidates.slice(0,10).map(article => article.id));
  assert.equal(finished.article,null);assert.equal(finished.position,10);assert.equal(finished.total,10);
  assert.equal(candidates.slice(10).length,5);assert.deepEqual(finished.unread,[]);
});

test('Moving or returning from the list does not mark an article understood',() => {
  const session = createReaderSession(candidates,'batch'), understood = [];
  const selected = focusReaderArticle(session,'5',understood), page = readerPage(selected,understood);
  assert.equal(page.article.id,'5');assert.equal(page.position,5);assert.equal(page.previousId,'4');assert.equal(page.nextId,'6');
  assert.equal(readerPage(session).article.id,'1');assert.deepEqual(understood,[]);assert.equal(page.unread.length,10);
});

test('Completing a late article returns to an earlier unread article and undo can restore the same page',() => {
  const session = focusReaderArticle(createReaderSession(candidates,'batch'),'10');
  assert.equal(readerPage(session,['10']).article.id,'1');
  const restored = focusReaderArticle(session,'10',[]);
  assert.equal(readerPage(restored).article.id,'10');assert.equal(readerPage(restored).position,10);
  assert.equal(focusReaderArticle(session,'10',['10']),session);
  assert.equal(focusReaderArticle(session,'outside'),session);
});

test('No candidates is a real empty state, and a new batch only starts when explicitly created',() => {
  assert.equal(readerPage(createReaderSession([],'empty')).article,null);
  const next = createReaderSession(candidates.slice(10),'refresh');
  assert.equal(readerPage(next).article.id,'11');assert.equal(readerPage(next).total,5);
});

test('Tokyo day changes at midnight in Japan, independent of the host timezone',() => {
  assert.equal(tokyoDay('2026-10-15T14:59:59Z'),'2026-10-15');
  assert.equal(tokyoDay('2026-10-15T15:00:00Z'),'2026-10-16');
});

test('Readable titles remove author/platform suffixes without replacing the actual headline',() => {
  assert.equal(readerTitle({sourceType:'note',title:'Geminiで資料を整理する｜著者名'}),'Geminiで資料を整理する');
  assert.equal(readerTitle({sourceType:'note',title:'Gmailで返信を書く｜操作方法・条件｜著者名'}),'Gmailで返信を書く');
  assert.equal(readerTitle({sourceType:'qiita',title:'定期的に資料を集める - Qiita'}),'定期的に資料を集める');
  assert.equal(readerTitle({sourceType:'official',title:'ChatGPT | New features'}),'ChatGPT | New features');
});

test('The point layout preserves every sentence rather than inventing or silently discarding content',() => {
  const text = '資料を渡す。条件を指定する。出典を確認する。誤りは人が直す。';
  const points = summaryPoints(text);
  assert.equal(points.length,3);assert.equal(points.join(''),text);
  assert.deepEqual(summaryPoints('短い説明です。'),['短い説明です。']);assert.deepEqual(summaryPoints(''),[]);
});
