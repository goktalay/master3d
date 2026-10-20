'use strict';

// m3:// protokolü — pencereler yalnız bu adresten yüklenir (file:// kullanılmaz):
//   m3://app/<yol>          uygulama dosyaları; yalnız izinli önekler (renderer, ortak betikler, simge)
//   m3://file/<jeton>/<yol> kullanıcının açtığı dosyanın klasörü. Jeton dosya açılınca üretilir; o klasörün dışına
//                           çıkılamaz (.., mutlak yol, sembolik bağ hedefi denetlenir). Dokular, .mtl ve .bin dosyaları
//                           böylece okuyucuların kendi göreli adresleriyle yüklenir.
// Saf yardımcılar (resolveAppPath, resolveFilePath) testte doğrulanır; Electron'a bağlı kısım register() içinde.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEME = 'm3';
const APP_ALLOW = ['src/renderer/', 'src/i18n.js', 'src/formats.js', 'build/icon.png', 'build/icon.svg'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ktx2': 'image/ktx2', '.txt': 'text/plain; charset=utf-8',
};
// Pencerelerin içerik güvenlik politikası: ağ yok; WebAssembly derlemesine izin; çalışan iş parçacıkları ve
// okuyucuların bellekte ürettiği dokular için blob:; kullanıcı dosyaları m3: üzerinden
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data: blob: m3:; connect-src 'self' m3: data: blob:; font-src 'self' data:; media-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
// Çalışan iş parçacığı (WebAssembly motorları): yalnız kendi betikleri ve WASM; ağ yok (connect-src yalnız uygulama
// dosyaları). DOM'a erişimi olmayan bu yalıtılmış iş parçacığında embind'in ürettiği işlevler için 'unsafe-eval' gerekir.
const WORKER_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; connect-src 'self'";

// Hangi yanıt hangi politikayla: sayfalar ve betikler CSP; çalışan iş parçacığı betiği WORKER_CSP
function cspFor(urlPath) {
  const p = String(urlPath || '');
  if (/\/gen\/(engine-worker|rhino3dm\/rhino-worker)\.js$/.test(p)) return WORKER_CSP;
  return /\.(html|m?js)$/.test(p) ? CSP : null;
}

// Uygulama içi yol: m3://app/src/renderer/index.html → <kök>/src/renderer/index.html (izinli öneklerde)
function resolveAppPath(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(String(urlPath || '').replace(/^\/+/, '')); } catch { return null; }
  if (!rel || rel.includes('\0') || rel.includes('\\')) return null;
  const norm = path.posix.normalize(rel);
  if (norm.startsWith('..') || path.posix.isAbsolute(norm)) return null;
  if (!APP_ALLOW.some((p) => (p.endsWith('/') ? norm.startsWith(p) : norm === p))) return null;
  return path.join(root, ...norm.split('/'));
}

// Kullanıcı dosyası: kök klasörün içinde kalmalı. realpath ile sembolik bağlar da çözülür.
function resolveFilePath(base, urlPath) {
  let rel;
  try { rel = decodeURIComponent(String(urlPath || '').replace(/^\/+/, '')); } catch { return null; }
  if (!rel || rel.includes('\0')) return null;
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (parts.some((p) => p === '..' || /^[a-z]:$/i.test(p))) return null;
  const full = path.resolve(base, ...parts);
  const inside = (p, b) => { const r = path.relative(b, p); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
  if (!inside(full, base)) return null;
  try {
    const real = fs.realpathSync(full);
    const realBase = fs.realpathSync(base);
    if (!inside(real, realBase)) return null;
    if (!fs.statSync(real).isFile()) return null;
    return real;
  } catch { return null; }
}

// Açılan dosyaların klasörleri: jeton → klasör. Oturum boyunca bellekte; en çok 64 klasör (eskiler düşer).
function createRoots(limit = 64) {
  const map = new Map();
  return {
    add(dir) {
      for (const [tok, d] of map) if (d === dir) return tok;
      const tok = crypto.randomBytes(12).toString('hex');
      map.set(tok, dir);
      while (map.size > limit) map.delete(map.keys().next().value);
      return tok;
    },
    get: (tok) => map.get(tok) || null,
    size: () => map.size,
  };
}

// URL'de her yol parçası ayrı kodlanır (boşluk, #, ? ve Türkçe karakterli dosya adları)
const encodePath = (rel) => rel.split(/[\\/]+/).map(encodeURIComponent).join('/');
const fileUrl = (tok, name) => `${SCHEME}://file/${tok}/${encodePath(name)}`;
const appUrl = (rel) => `${SCHEME}://app/${rel}`;

function registerPrivileged(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
}

function register({ protocol, root, roots }) {
  protocol.handle(SCHEME, async (req) => {
    let u;
    try { u = new URL(req.url); } catch { return new Response('bad request', { status: 400 }); }
    let file = null;
    if (u.host === 'app') file = resolveAppPath(root, u.pathname);
    else if (u.host === 'file') {
      const m = /^\/([0-9a-f]{24})(\/.*)$/.exec(u.pathname);
      const base = m && roots.get(m[1]);
      if (base) file = resolveFilePath(base, m[2]);
    }
    if (!file) return new Response('not found', { status: 404 });
    try {
      const st = await fs.promises.stat(file);
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': String(st.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      const csp = u.host === 'app' ? cspFor(u.pathname) : null;
      if (csp) headers['Content-Security-Policy'] = csp;
      const { Readable } = require('stream');
      return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

module.exports = { SCHEME, CSP, WORKER_CSP, cspFor, APP_ALLOW, resolveAppPath, resolveFilePath, createRoots, fileUrl, appUrl, encodePath, registerPrivileged, register };
