import {canonicalUrl} from './shared.js';
// 公開データとlocalStorageの両方に同じ制限を適用する。
const IMAGE_HOSTS = new Set(['assets.st-note.com','static.zenn.studio','qiita-user-contents.imgix.net','qiita-image-store.s3.ap-northeast-1.amazonaws.com','storage.googleapis.com','images.ctfassets.net','res.cloudinary.com']);
const ARTICLE_HOSTS = new Set(['openai.com','www.openai.com','anthropic.com','www.anthropic.com','blog.google','note.com','zenn.dev','qiita.com']);
export function publicFigureUrl(value) {
  try {
    if (typeof value !== 'string') return '';
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || value.length > 1800) return '';
    if (!IMAGE_HOSTS.has(url.hostname) && !ARTICLE_HOSTS.has(url.hostname)) return '';
    if (url.hostname === 'storage.googleapis.com' && !url.pathname.startsWith('/gweb-uniblog-publish-prod/')) return '';
    if (url.hostname === 'res.cloudinary.com' && (!url.pathname.startsWith('/zenn/image/fetch/') || !/\/https:\/\/(?:qiita-image-store\.s3\.ap-northeast-1\.amazonaws\.com|static\.zenn\.studio)\//.test(decodeURIComponent(url.pathname)))) return '';
    if (/\.(?:svg|gif)(?:$|\?)/i.test(url.pathname) || /avatar|profile|\/topics\/|\/drawing\/|tracking|pixel|logo|icon|banner|thumbnail|サムネイル/i.test(url.href)) return '';
    return url.href;
  } catch {return '';}
}
function sourceUrl(value) {
  try {const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && ARTICLE_HOSTS.has(url.hostname) ? canonicalUrl(url.href) : '';} catch {return '';}
}
const bounded = (value,limit) => typeof value === 'string' ? value.replace(/\s+/g,' ').trim().slice(0,limit) : '';
export function sanitizeFigures(value,articleUrl) {
  const source = sourceUrl(articleUrl);
  if (!source || !Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap(item => {
    const url = publicFigureUrl(item?.url);
    if (!url || seen.has(url) || item.sourceUrl && sourceUrl(item.sourceUrl) !== source) return [];
    seen.add(url);
    return [{url,alt:bounded(item.alt,160) || '元記事の図解・操作画面',caption:bounded(item.caption,140),sourceUrl:source}];
  }).slice(0,2);
}
export function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['youtube.com','www.youtube.com'].includes(url.hostname) || url.username || url.password || url.port) return '';
    const id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})$/)?.[1];
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : '';
  } catch {return '';}
}
export function videoTimeUrl(videoUrl,seconds) {
  const id = youtubeVideoId(videoUrl);
  return id && Number.isFinite(seconds) && seconds >= 0 && seconds <= 21600 ? `https://www.youtube.com/watch?v=${id}&t=${Math.floor(seconds)}s` : '';
}
export function sanitizeVideoSections(value,videoUrl,{chapters = false} = {}) {
  if (!youtubeVideoId(videoUrl) || !Array.isArray(value)) return [];
  return value.flatMap(item => {
    const seconds = Number(item?.startSeconds),url = videoTimeUrl(videoUrl,seconds),title = bounded(item?.title,80);
    if (!url || !title) return [];
    if (chapters) return [{title,startSeconds:Math.floor(seconds),url}];
    const steps = Array.isArray(item.steps) ? item.steps.map(text => bounded(text,160)).filter(Boolean).slice(0,4) : [];
    if (!steps.length) return [];
    return [{title,startSeconds:Math.floor(seconds),url,steps,result:bounded(item.result,180)}];
  }).slice(0,chapters ? 6 : 3);
}
