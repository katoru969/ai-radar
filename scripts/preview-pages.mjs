import http from 'node:http';
import fs from 'node:fs/promises';
const root = new URL('../public/',import.meta.url),prefix = '/ai-radar/';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const assets = new Set(['index.html','app.js','styles.css','shared.js','article-details.js','feed-refresh.js','terms.js','manifest.webmanifest','sw.js','icon-180.png','icon-192.png','icon-512.png','data/feed.json']);
http.createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/') {res.writeHead(302,{location:prefix});return res.end();}
  if (!pathname.startsWith(prefix) || !['GET','HEAD'].includes(req.method)) {res.writeHead(404);return res.end();}
  const name = pathname.slice(prefix.length) || 'index.html';
  if (!assets.has(name)) {res.writeHead(404);return res.end();}
  try {
    const data = await fs.readFile(new URL(name,root));
    res.setHeader('Content-Type',types[name.slice(name.lastIndexOf('.'))] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404);res.end();}
}).listen(Number(process.env.PORT) || 3001,'127.0.0.1',() => console.log(`AI Radar Pages preview → http://localhost:${Number(process.env.PORT) || 3001}${prefix}`));
