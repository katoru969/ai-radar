import {SOURCE_TYPES,canonicalUrl,TERM_NAMES,INTERESTS} from '../shared.js';

export function sanitizeSnapshot(data) {
  if (!data || !Array.isArray(data.articles)) return null;
  const articles = data.articles.filter(item => item && SOURCE_TYPES.includes(item.sourceType) && typeof item.id === 'string' && canonicalUrl(item.url) && Number.isFinite(Date.parse(item.publishedAt))).slice(0,100).map(item => ({
    id:item.id,title:String(item.title || '').slice(0,150),source:String(item.source || '').slice(0,120),sourceId:String(item.sourceId || '').slice(0,100),sourceFamily:String(item.sourceFamily || '').slice(0,120),
    sourceType:item.sourceType,url:canonicalUrl(item.url),publishedAt:item.publishedAt,publishedAtPrecision:item.publishedAtPrecision === 'day' ? 'day' : 'datetime',
    originalTitle:String(item.originalTitle || '').slice(0,300),originalSummary:String(item.originalSummary || '').slice(0,1800),summary:String(item.summary || '').slice(0,300),
    whyImportant:String(item.whyImportant || '').slice(0,200),personalRelevance:String(item.personalRelevance || '').slice(0,200),
    importanceScore:Math.max(0,Math.min(100,Number(item.importanceScore) || 0)),importanceGrade:['A','B','C'].includes(item.importanceGrade) ? item.importanceGrade : 'C',
    terms:Array.isArray(item.terms) ? item.terms.filter(term => TERM_NAMES.includes(term)).slice(0,4) : [],topics:Array.isArray(item.topics) ? item.topics.filter(topic => INTERESTS.includes(topic)) : [],
    thumbnail:canonicalUrl(item.thumbnail),linkedUrl:canonicalUrl(item.linkedUrl),discussionUrl:canonicalUrl(item.discussionUrl),summaryMode:item.summaryMode === 'openai' ? 'openai' : 'rules',
    ...(item.socialMetrics ? {socialMetrics:Object.fromEntries(['likes','reposts','replies','points','comments'].filter(key => Number.isFinite(item.socialMetrics[key])).map(key => [key,Math.max(0,Math.floor(item.socialMetrics[key]))]))} : {})
  }));
  return {
    schemaVersion:2,generatedAt:Number.isFinite(Date.parse(data.generatedAt)) ? data.generatedAt : null,
    checkedAt:Number.isFinite(Date.parse(data.checkedAt)) ? data.checkedAt : null,refreshAfter:15 * 60000,
    articles,sources:Array.isArray(data.sources) ? data.sources.filter(source => source && SOURCE_TYPES.includes(source.sourceType)).map(source => ({
      id:String(source.id || '').slice(0,100),name:String(source.name || '').slice(0,120),sourceType:source.sourceType,
      status:['ok','empty','partial','cached','error'].includes(source.status) ? source.status : 'error',count:Math.max(0,Math.floor(Number(source.count) || 0)),
      fetchedAt:Number.isFinite(Date.parse(source.fetchedAt)) ? source.fetchedAt : null
    })) : [],summary:{mode:'rules',state:'off'},degraded:data.degraded === true
  };
}

export function sourceCacheFromSnapshot(snapshot) {
  return new Map((snapshot?.sources || []).filter(source => source.fetchedAt).map(source => [source.id,{
    articles:snapshot.articles.filter(article => article.sourceId === source.id),fetchedAt:source.fetchedAt
  }]));
}

export function preserveSnapshotOnFailure(next,previous) {
  if (next.articles.length || next.sources.some(source => ['ok','empty','partial'].includes(source.status)) || !previous?.articles.length) return next;
  const configured = new Set(next.sources.map(source => source.id));
  return {...next,articles:previous.articles.filter(article => configured.has(article.sourceId)),generatedAt:previous.generatedAt,degraded:true};
}
