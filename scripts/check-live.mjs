import {getFeed} from '../api/feed.js';
import {selectToday} from '../shared.js';
const feed = await getFeed();
const today = selectToday(feed.articles,{sources:{}, interests:['AI技術全般']});
console.log(JSON.stringify({generatedAt:feed.generatedAt, articleCount:feed.articles.length, sources:feed.sources, today:today.map(article => ({title:article.title, originalTitle:article.originalTitle, source:article.source, publishedAt:article.publishedAt, grade:article.importanceGrade, url:article.url, summary:article.summary}))},null,2));
if (today.length < 3 || today.length > 5) process.exitCode = 1;
