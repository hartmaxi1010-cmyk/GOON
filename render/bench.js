// Misst Render- und Screenshot-Zeit pro Szene: node bench.js t1 t2 ...
const { chromium } = require('playwright'); const path = require('path'); const http = require('http'), fs = require('fs');
const ROOT = __dirname, BUILD = path.join(__dirname, '..', 'build');
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = p === '/timeline.json' ? path.join(BUILD, 'timeline.json') : path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } }); await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html${process.env.Q || ''}`);
  let t = Date.now(); await pg.waitForFunction(() => window.ready !== undefined); await pg.evaluate(() => window.ready); console.log('setup ms', Date.now() - t);
  for (const ts of process.argv.slice(2).map(Number)) {
    t = Date.now();
    for (let i = 0; i < 3; i++) await pg.evaluate(x => { window.renderAt(x); const g = document.querySelector('canvas').getContext('webgl2');
      g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); }, ts + i / 60);
    const r = (Date.now() - t) / 3; t = Date.now(); for (let i = 0; i < 3; i++) await pg.screenshot({ type: 'png' }); const s = (Date.now() - t) / 3;
    t = Date.now(); for (let i = 0; i < 3; i++) await pg.screenshot({ type: 'jpeg', quality: 95 }); const j = (Date.now() - t) / 3;
    t = Date.now(); for (let i = 0; i < 3; i++) await pg.evaluate(() => document.querySelector('canvas').toDataURL('image/jpeg', 0.95).length); const d = (Date.now() - t) / 3;
    console.log(ts, 'render', r.toFixed(0), 'png', s.toFixed(0), 'jpeg', j.toFixed(0), 'dataURL', d.toFixed(0));
  }
  await b.close(); srv.close();
});
