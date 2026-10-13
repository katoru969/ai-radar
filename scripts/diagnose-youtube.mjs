import fs from 'node:fs/promises';
import config from '../sources.json' with {type:'json'};
import {embeddedJson,parseWatchPage} from '../lib/youtube.mjs';
import {fetchText,safeFetchError} from '../lib/transport.mjs';
import * as cheerio from 'cheerio';

// 障害時だけ、公開ページの形式と例外の種類を確認。HTML・字幕URL・環境変数は出力しない。
const snapshot = JSON.parse(await fs.readFile(new URL('../data/feed.json',import.meta.url),'utf8'));
const failed = new Set(snapshot.sources.filter(source=>source.sourceType === 'youtube' && source.error === 'youtube_metadata_missing').map(source=>source.id));
for (const [sourceId,videoId] of [['youtube-chaen','tEA7wZFxEl0'],['youtube-pivot','-7wdCVCbH7w']]) {
  if (!failed.has(sourceId)) continue;
  const source = {...config.youtube.find(source=>source.id === sourceId),sourceType:'youtube'};
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`,{timeoutMs:10000,maxBytes:4000000,accept:'text/html'});
    const $ = cheerio.load(html);
    let player;
    try {player = embeddedJson(html,'ytInitialPlayerResponse');} catch {}
    const canonical = $('link[rel="canonical"]').attr('href') || '';
    const shape = {sourceId,videoId,bytes:Buffer.byteLength(html),player:!!player,videoDetails:!!player?.videoDetails,canonicalAbsolute:/^https:\/\//.test(canonical),canonicalRelative:canonical.startsWith('/'),channelMeta:!!$('meta[itemprop="channelId"]').attr('content'),dateMeta:!!$('meta[itemprop="datePublished"]').attr('content')};
    try {console.log(JSON.stringify({...shape,articleParsed:!!parseWatchPage(html,videoId,source)}));}
    catch (error) {console.log(JSON.stringify({...shape,parseError:error.name,message:String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,150)}));}
  } catch (error) {console.log(JSON.stringify({sourceId,videoId,error:safeFetchError(error),name:error.name,code:error.code || '',cause:error.cause?.code || ''}));}
}
