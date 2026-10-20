// Uçtan uca: paketlenmiş (ya da geliştirme) Electron uygulamasını gerçek ana süreçle çalıştırır. Sahte bir hesap sunucusu
// (/api/m3: prelogin, login, me, library, releases) girişi karşılar; uygulama --open ile verilen dosyayla başlar, giriş
// penceresine CDP üzerinden e-posta / şifre yazılır, ana pencerede model açılınca parça / üçgen sayısı ve sayfa hataları
// denetlenir, ekran görüntüsü alınır. m3:// protokolü, modül betiği, WebAssembly iş parçacıkları ve içerik güvenlik
// politikası böylece Electron'un kendisinde sınanır.
// Kullanım: DISPLAY=:93 node scripts/e2e-electron.js [uygulama yolu] <model> [<model>…]
//   uygulama yolu verilmezse node_modules/.bin/electron + depo kökü
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const exe = args[0] && fs.existsSync(args[0]) && fs.statSync(args[0]).isFile() && !/\.\w+$/.test(path.basename(args[0])) ? args.shift() : null;
const models = args.map((p) => path.resolve(p));
if (!models.length) { console.error('model yolu gerekli'); process.exit(2); }

const KDF = { alg: 'PBKDF2-SHA256', iter: 1000, salt: crypto.randomBytes(16).toString('base64') };
let library = null;
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const send = (s, j) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    const u = req.url.split('?')[0];
    if (u === '/api/m3/auth/prelogin') return send(200, { kdf: KDF });
    if (u === '/api/m3/auth/login') return send(200, { token: 'e2e-token', user: { id: 1, email: body.email, name: 'E2E' }, sync_enabled: true, kdf: KDF });
    if (u === '/api/m3/me') return send(200, { user: { id: 1, email: 'e2e@example.com' }, sync_enabled: true, kdf: KDF });
    if (u === '/api/m3/library' && req.method === 'GET') return send(200, library || { version: null });
    if (u === '/api/m3/library' && req.method === 'PUT') { library = { version: (library?.version || 0) + 1, blob: body.blob }; return send(200, { version: library.version }); }
    if (u === '/api/m3/releases/latest') return send(200, { version: '1.0.0' });
    if (u === '/api/m3/auth/sso') return send(401, { code: 'sso_invalid' });
    return send(404, { code: 'not_found' });
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const api = `http://127.0.0.1:${server.address().port}`;
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-e2e-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const cmd = exe || path.join(ROOT, 'node_modules', '.bin', 'electron');
  const cargs = [...(exe ? [] : [ROOT]), `--user-data-dir=${ud}`, `--remote-debugging-port=${port}`, '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--open', models[0]];
  const proc = spawn(cmd, cargs, { env: { ...process.env, M3_API: api }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const fail = (m) => { console.error('×', m); console.error(log.split('\n').filter((l) => !/bus\.cc|viz_main|gles2_cmd|GroupMarker/.test(l)).slice(-25).join('\n')); proc.kill(); process.exit(1); };
  let browser = null;
  for (let i = 0; i < 60 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { /* henüz yok */ }
  }
  if (!browser) fail('CDP bağlanamadı');
  const findPage = async (re, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      for (const c of browser.contexts()) for (const p of c.pages()) if (re.test(p.url())) return p;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  };
  const login = await findPage(/login\.html$/);
  if (!login) fail('giriş penceresi açılmadı');
  console.log('✓ giriş penceresi:', login.url());
  await login.fill('#email', 'e2e@example.com');
  await login.fill('#password', 'Test1234!');
  await login.click('#submit');
  const main = await findPage(/index\.html$/);
  if (!main) fail('ana pencere açılmadı');
  const errors = [];
  main.on('pageerror', (e) => errors.push(e.message));
  main.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  console.log('✓ ana pencere:', main.url());
  const results = [];
  const waitDoc = (name) => main.waitForFunction((n) => {
    const d = window.M3 && window.M3.doc;
    if (d && d.file.name === n && document.querySelector('#loading').classList.contains('hidden')) return { ok: true, parts: d.parts.length, tris: d.stats.triangles, engine: d.result.engine };
    const e = document.querySelector('.toast.err');
    return e ? { ok: false, error: e.textContent } : null;
  }, name, { timeout: 120000, polling: 250 }).then((h) => h.jsonValue()).catch((e) => ({ ok: false, error: e.message }));
  for (let i = 0; i < models.length; i++) {
    // İlk dosya --open ile (girişten sonra pendingOpen); diğerleri ana sürecin openPath'i + arayüzün açma akışı
    if (i > 0) await main.evaluate((p) => window.api.openPath(p).then((r) => window.M3.openResult(r)), models[i]);
    const ok = await waitDoc(path.basename(models[i]));
    results.push({ file: path.basename(models[i]), ...ok });
    console.log(ok.ok ? '✓' : '×', path.basename(models[i]), JSON.stringify(ok));
  }
  await main.waitForTimeout(800);
  const shot = path.join(os.tmpdir(), 'm3-e2e.png');
  await main.screenshot({ path: shot });
  console.log('ekran görüntüsü:', shot);
  const csp = await main.evaluate(() => fetch(location.href).then((r) => r.headers.get('Content-Security-Policy')));
  console.log(csp && csp.includes("default-src 'self'") ? '✓ CSP başlığı' : '× CSP başlığı yok', '·', errors.length ? `sayfa hataları: ${errors.slice(0, 5).join(' | ')}` : 'sayfa hatası yok');
  await browser.close().catch(() => {});
  proc.kill();
  server.close();
  fs.rmSync(ud, { recursive: true, force: true });
  process.exit(results.every((r) => r.ok) && !errors.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
