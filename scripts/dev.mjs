import http from 'node:http';
import fs from 'node:fs/promises';
import handler from '../api/feed.js';
const root = new URL('../', import.meta.url);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const allowed = new Set(['index.html','app.js','styles.css','shared.js','article-details.js','feed-refresh.js','article-state.js','terms.js','manifest.webmanifest','sw.js','icon-180.png','icon-192.png','icon-512.png']);
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/api/feed') {
    res.status = code => {res.statusCode = code; return res;};
    res.json = body => {res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(body));};
    return handler(req,res);
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); return res.end();}
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!allowed.has(name)) {res.writeHead(404); return res.end('Not found');}
  try {
    const data = await fs.readFile(new URL(name,root));
    res.setHeader('Content-Type',types[name.slice(name.lastIndexOf('.'))] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    if (name === 'sw.js') res.setHeader('Service-Worker-Allowed','/');
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404); res.end('Not found');}
});
const port = Number(process.env.PORT) || 3000;
server.listen(port,'127.0.0.1',() => console.log(`AI Radar → http://localhost:${port}`));
