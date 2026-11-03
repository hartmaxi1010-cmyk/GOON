// Rendert Frames im Headless-Chromium. Nutzung:
//   node capture.js stills <t1,t2,...> <outdir>          -> PNG-Standbilder zur Kontrolle
//   node capture.js video <frameStart> <frameEnd> <out.mp4> -> Segment, 60 fps, nahezu verlustfrei
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = __dirname, BUILD = path.join(ROOT, '..', 'build');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = p === '/timeline.json' ? path.join(BUILD, 'timeline.json') : path.join(ROOT, p);
      fs.readFile(f, (e, d) => { if (e) { rsp.writeHead(404); rsp.end(); return; }
        rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); rsp.end(d); });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const [mode, a, b, c] = process.argv.slice(2);
  const srv = await serve(); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('[browser]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.ready !== undefined);
  await page.evaluate(() => window.ready);
  const fps = await page.evaluate(() => window.FPS);
  if (mode === 'stills') {
    fs.mkdirSync(b, { recursive: true });
    for (const ts of a.split(',')) {
      const id = await page.evaluate(t => window.renderAt(t), parseFloat(ts));
      await page.screenshot({ path: path.join(b, `t${parseFloat(ts).toFixed(2)}_${id}.png`) });
      console.log('still', ts, id);
    }
  } else {
    const f0 = parseInt(a), f1 = parseInt(b);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv420p', '-r', String(fps), c], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = f0; f < f1; f++) {
      await page.evaluate(t => window.renderAt(t), f / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 97 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if ((f - f0) % 60 === 0) console.log(`${path.basename(c)}: Frame ${f}/${f1} (${((Date.now() - t0) / (f - f0 + 1)).toFixed(0)} ms/Frame)`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }
  await browser.close(); srv.close();
})();
