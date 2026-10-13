import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {transcriptQueue,applyVideoTranscript} from '../lib/video-summary.mjs';
import {transcriptPanelSegments,transcriptVideoMatches} from '../lib/transcript-panel.mjs';
import {youtubeVideoId} from '../article-details.js';
import {sanitizeSnapshot} from '../lib/snapshot.mjs';

const file=new URL('../data/feed.json',import.meta.url);
const snapshot=sanitizeSnapshot(JSON.parse(await fs.readFile(file,'utf8'))),now=Date.now();
const queue=transcriptQueue(snapshot.articles,{now,maxVideos:8,browser:true});
let browser,stopped=false;
const outcomes=[];
// Optional enrichment has its own budget. The news feed survives browser failures.
const stop=setTimeout(()=>{stopped=true;void browser?.close().catch(()=>{});},90000);
try {
  if (queue.length) browser=await chromium.launch({headless:true,timeout:20000});
  const context=browser ? await browser.newContext({locale:'ja-JP',viewport:{width:1280,height:900}}) : null;
  for (const article of queue) {
    if (stopped) break;
    const id=youtubeVideoId(article.url),page=await context.newPage();
    let segments=[],reason='browser_unavailable',captionKind='',stage='navigation',transcriptHttp=null;
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(12000);
    page.on('response',async response=>{
      try {
        const responseUrl=new URL(response.url());
        if (responseUrl.hostname!=='www.youtube.com' || responseUrl.pathname!=='/youtubei/v1/get_transcript') return;
        transcriptHttp=response.status();
        if (!response.ok()) return;
        const body=await response.body();
        if (body.length>2000000) return;
        const rows=transcriptPanelSegments(JSON.parse(body.toString('utf8')));
        if (rows.length) segments=rows;
      } catch {}
    });
    try {
      await page.goto(`https://www.youtube.com/watch?v=${id}&hl=ja`,{waitUntil:'domcontentloaded'});
      stage='heading';
      await page.getByRole('heading',{level:1}).first().waitFor();
      stage='identity';
      const canonicalLink=page.locator('link[rel="canonical"]');
      const canonical=await canonicalLink.count() ? await canonicalLink.first().getAttribute('href') : '';
      if (!transcriptVideoMatches(page.url(),canonical,id)) throw new Error('identity');
      // Only normal public UI. Login, CAPTCHA and restricted videos are left alone.
      const more=page.locator('#description-inline-expander').getByRole('button',{name:/^(もっと見る|Show more|more)$/i}).first();
      const show=page.getByRole('button',{name:/^(文字起こしを表示|Show transcript)$/i}).first();
      stage='expand-description';
      if (!await show.isVisible()) {
        try {await more.waitFor({state:'visible',timeout:5000});await more.click();} catch {}
      }
      stage='transcript-button';
      await show.waitFor({timeout:6000});
      await show.click();
      stage='transcript-response';
      const rows=page.locator('ytd-transcript-segment-renderer');
      try {await rows.first().waitFor({timeout:7000});} catch {}
      if (!segments.length) segments=await rows.evaluateAll(elements=>elements.map(element=>{
        const stamp=element.querySelector('.segment-timestamp')?.textContent?.trim() || '';
        const parts=stamp.split(':').map(Number);
        const text=element.querySelector('.segment-text')?.textContent?.trim() || '';
        return {startSeconds:/^\d{1,2}:\d{2}(?::\d{2})?$/.test(stamp) ? parts.reduce((total,value)=>total*60+value,0) : NaN,text};
      }).filter(row=>Number.isFinite(row.startSeconds) && row.startSeconds>=0 && row.startSeconds<=21600 && /[ぁ-んァ-ヶ一-龯]/u.test(row.text)).slice(0,5000));
      reason=segments.length ? '' : 'browser_unavailable';
    } catch {reason='browser_unavailable';}
    const ready=applyVideoTranscript(article,{segments,reason,captionKind},{now,method:'browser'});
    const publicPage=await page.locator('body').innerText({timeout:1000}).catch(()=>'');
    outcomes.push({videoId:id,ready,segments:segments.length,reason:article.transcriptReason,stage,transcriptHttp,restricted:/Sign in to confirm|not a bot|ロボットでない|ログインして確認|unusual traffic|CAPTCHA/i.test(publicPage)});
    await page.close().catch(()=>{});
  }
} catch {
  // No raw exceptions, page HTML, cookies or signed URLs go to public logs.
  console.log('YouTube browser enrichment unavailable; preserving collected news.');
} finally {
  clearTimeout(stop);
  await browser?.close().catch(()=>{});
}
if (outcomes.length) await fs.writeFile(file,JSON.stringify(sanitizeSnapshot(snapshot)));
console.log(JSON.stringify({captionMethod:'public-transcript-panel',attempted:outcomes.length,ready:outcomes.filter(row=>row.ready).length,outcomes,paidAiCalls:0}));
