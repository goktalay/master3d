// Arayüzü Electron olmadan, Chromium'da gerçek dosyalarla çalıştırma düzeneği (ekran görüntüleri ve biçim doğrulaması).
// - Küçük bir HTTP sunucusu m3:// protokolünün iki kökünü taklit eder: /app/<yol> (izinli uygulama dosyaları) ve
//   /file/<jeton>/<yol> (açılan dosyanın klasörü). Yol denetimi src/protocol.js ile aynıdır.
// - window.api, preload.js ile aynı yüzeyde taklit edilir; dosya açma / yan dosyalar / kaydetme Node tarafına köprülenir.
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');
const PROTO = require('../src/protocol');
const FORMATS = require('../src/formats');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.json': 'application/json' };

function startServer() {
  const roots = PROTO.createRoots();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let file = null;
    if (u.pathname.startsWith('/app/')) file = PROTO.resolveAppPath(ROOT, u.pathname.slice(4));
    else {
      const m = /^\/file\/([0-9a-f]{24})(\/.*)$/.exec(u.pathname);
      const base = m && roots.get(m[1]);
      if (base) file = PROTO.resolveFilePath(base, m[2]);
    }
    let st = null;
    try { st = file && fs.statSync(file); } catch { st = null; }
    if (!st || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' };
    // src/protocol.js ile aynı başlıklar (pencere ve çalışan iş parçacıkları için içerik güvenlik politikası)
    const csp = PROTO.cspFor(u.pathname.slice(4));
    if (u.pathname.startsWith('/app/') && csp) headers['Content-Security-Policy'] = csp.replace(/ m3:/g, '');
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const describe = (p) => {
      const full = path.resolve(p);
      const st = fs.statSync(full);
      const name = path.basename(full);
      const fmt = FORMATS.formatOf(name);
      if (!fmt) return { ok: false, code: 'unsupported', ext: FORMATS.extOf(name) };
      const tok = roots.add(path.dirname(full));
      return { ok: true, file: { name, path: full, dir: path.dirname(full), size: st.size, mtime: st.mtimeMs, format: fmt.id, engine: fmt.engine, token: tok,
        url: `${base}/file/${tok}/${PROTO.encodePath(name)}`, baseUrl: `${base}/file/${tok}/` } };
    };
    const sidecars = (tok) => {
      const dir = roots.get(tok);
      if (!dir) return [];
      return fs.readdirSync(dir).filter((n) => FORMATS.SIDECAR_EXTS.includes(FORMATS.extOf(n))).map((n) => ({ name: n, url: `${base}/file/${tok}/${PROTO.encodePath(n)}`, size: fs.statSync(path.join(dir, n)).size }));
    };
    resolve({ server, base, describe, sidecars, close: () => new Promise((r) => server.close(r)) });
  }));
}

// window.api taklidi: store/hesap verileri sabit; dosya işlemleri Node'a köprülenir (exposeFunction)
function stubScript({ lang = 'tr', settings = {}, recent = [], acct = {} }) {
  const viewer = { background: 'gradient', grid: true, axes: false, shadows: true, edges: false, bbox: false, lighting: 'studio', units: 'auto', upAxis: 'auto',
    projection: 'perspective', cadQuality: 'medium', explodeMode: 'radial', autoRotate: false, invertZoom: false, showStats: true, ...(settings.viewer || {}) };
  const store = { settings: { appTheme: 'system', language: lang, checkUpdates: true, shellMenu: true, exportPrefs: { format: 'glb', scope: 'all', convert: true }, ...settings, viewer }, recent, platform: 'win32' };
  const account = { loggedIn: true, email: 'ornek@example.com', user: { email: 'ornek@example.com', name: 'Örnek Kullanıcı' }, syncEnabled: true, state: 'idle', lastSyncAt: Date.UTC(2026, 9, 20, 9, 12), appVersion: '1.0.0', ...acct };
  return `(() => {
    const STORE = ${JSON.stringify(store)};
    const ACCT = ${JSON.stringify(account)};
    const listeners = {};
    const on = (ch) => (cb) => { (listeners[ch] = listeners[ch] || []).push(cb); return () => {}; };
    const emit = (ch, d) => (listeners[ch] || []).forEach((cb) => cb(d));
    window.__m3emit = emit;
    window.api = {
      lang: ${JSON.stringify(lang)}, version: '1.0.0',
      accountState: async () => ACCT, login: async () => ({ ok: true }), logout: async () => {}, syncNow: async () => {}, setSyncEnabled: async () => ({ ok: true }),
      deleteRemoteLibrary: async () => ({ ok: true }), openWeb: async () => {}, onAccountStatus: on('account:status'), onUpdateAvailable: on('app:update'),
      openMastertool: async () => {}, about: async () => ({ version: '1.0.0', electron: '33.2.1', chrome: '130.0.6723.137', portable: false, packaged: true, update: null, platform: 'win32' }),
      checkUpdate: async () => ({ ok: true, newer: false }), openLicenses: async () => {},
      getStore: async () => JSON.parse(JSON.stringify(STORE)), onStoreChanged: on('store:changed'),
      setSettings: async (p) => { if (p.viewer) Object.assign(STORE.settings.viewer, p.viewer); const { viewer, ...rest } = p; Object.assign(STORE.settings, rest); setTimeout(() => emit('store:changed', JSON.parse(JSON.stringify(STORE))), 0); return { ok: true }; },
      shellStatus: async () => ({ supported: true, registered: true, pointsHere: true, enabled: true }),
      openDialog: async () => ({ ok: false, code: 'canceled' }),
      openPath: async (p) => window.__m3open(p), pendingOpen: async () => null, onOpenRequest: on('file:openRequest'),
      pathForFile: () => '', sidecars: async (tok) => window.__m3sidecars(tok),
      recentRemove: async () => ({ ok: true }), recentClear: async () => ({ ok: true }), showInFolder: async () => ({ ok: true }),
      saveExport: async (files) => window.__m3save(files.map((f) => ({ name: f.name, b64: btoa(Array.from(f.data, (c) => String.fromCharCode(c)).join('')) }))),
      saveExportFolder: async (files) => ({ ok: true, path: '/tmp', count: files.length }), showExported: async () => ({ ok: true }), copyImage: async () => ({ ok: true }),
    };
  })();`;
}

async function launch() {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', ...(process.env.M3_GPU_COMPOSITING ? [] : ['--disable-gpu-compositing'])] });
}

// Sayfa: tema (dark/light), dil; dosya köprüleri bağlanır
async function openApp(browser, srv, { lang = 'tr', theme = 'dark', width = 1600, height = 1000, settings = {}, recent = [], saveDir = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 1, locale: lang === 'tr' ? 'tr-TR' : 'en-US', timezoneId: lang === 'tr' ? 'Europe/Istanbul' : 'Europe/London' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.exposeFunction('__m3open', (p) => srv.describe(p));
  await page.exposeFunction('__m3sidecars', (tok) => srv.sidecars(tok));
  await page.exposeFunction('__m3save', (files) => {
    if (saveDir) { fs.mkdirSync(saveDir, { recursive: true }); for (const f of files) fs.writeFileSync(path.join(saveDir, f.name), Buffer.from(f.b64, 'base64')); }
    return { ok: true, path: saveDir ? path.join(saveDir, files[0].name) : files[0].name, name: files[0].name };
  });
  await page.addInitScript(stubScript({ lang, settings, recent }));
  await page.goto(`${srv.base}/app/src/renderer/index.html`);
  await page.waitForSelector('#welcome .dropzone');
  return page;
}

// Dosyayı arayüzün kendi akışıyla açar; model yüklenene ya da hata bildirimi çıkana kadar bekler
async function openModel(page, file, { timeout = 120000 } = {}) {
  await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  const t0 = Date.now();
  await page.evaluate((p) => window.api.openPath(p).then((r) => window.__m3emit('file:openRequest', r)), file);
  const h = await page.waitForFunction((p) => {
    const d = window.M3 && window.M3.doc;
    if (d && d.file.path === p && document.querySelector('#loading').classList.contains('hidden')) return { ok: true };
    const err = document.querySelector('.toast.err');
    if (err) return { ok: false, error: err.textContent.trim() };
    return null;
  }, file, { timeout, polling: 100 });
  const r = await h.jsonValue();
  r.ms = Date.now() - t0;
  if (r.ok) Object.assign(r, await page.evaluate(() => {
    const d = window.M3.doc;
    return { parts: d.parts.length, triangles: d.stats.triangles, points: d.stats.pointCount, engine: d.result.engine, warnings: d.warnings.map((w) => w.key + (w.vars && w.vars.name ? ':' + w.vars.name : '')), anims: (d.result.animations || []).length };
  }));
  return r;
}

module.exports = { startServer, stubScript, launch, openApp, openModel, ROOT };
