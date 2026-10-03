import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { webFiles } from './web-files.mjs';

const allowed = new Set(webFiles);
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
    if (!['GET', 'HEAD'].includes(req.method) || !allowed.has(path)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': mime[path.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
let port = Number(process.env.PORT || 5173);
server.on('error', error => {
  if (error.code === 'EADDRINUSE') server.listen(++port, '127.0.0.1');
  else { console.error(error); process.exitCode = 1; }
});
server.listen(port, '127.0.0.1', () => console.log(`TKB: http://127.0.0.1:${server.address().port}`));
