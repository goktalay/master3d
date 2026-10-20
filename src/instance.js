'use strict';

// Tek örnek ve dosya iletimi. Gezgin'de "Master 3D ile aç" ya da "Birlikte aç" her seferinde yeni bir süreç başlatır:
//   "…\Master 3D.exe" --open "C:\…\parca.step"
// Açık bir pencere varsa yeni süreç kilidi alamaz; isteğini kilit verisiyle (additionalData) iletip kapanır, açık
// pencere dosyayı açar. Kilit verisi kullanılır çünkü Chromium ikinci örneğin komut satırına kendi anahtarlarını ekler.

const path = require('path');

const PROTOCOL = 1;

// argv → { open: yol | null }   (--open <yol>, --open=<yol> ya da tek başına yol; exe'nin üzerine sürükleme)
function parseArgs(argv, { cwd = null, skip = 1 } = {}) {
  const out = { open: null };
  const args = (argv || []).slice(skip);
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] ?? '');
    if (a === '--open' || a === '-o') { if (i + 1 < args.length) out.open = String(args[++i]); continue; }
    if (a.startsWith('--open=')) { out.open = a.slice(7); continue; }
    if (a.startsWith('-') || a === '.') continue; // Chromium/Electron anahtarları, geliştirmedeki "."
    if (!out.open) out.open = a;
  }
  if (out.open) {
    out.open = out.open.replace(/^"(.*)"$/, '$1');
    if (cwd && !isAbsolute(out.open)) out.open = (isWinPath(cwd) ? path.win32 : path).resolve(cwd, out.open);
  }
  return out;
}

const isWinPath = (p) => /^[a-z]:[\\/]|^\\\\/i.test(p);
const isAbsolute = (p) => isWinPath(p) || path.isAbsolute(p);

const toLockData = (req) => ({ m3: PROTOCOL, open: req.open || null });
function fromSecondInstance(argv, cwd, data, skip) {
  if (data && data.m3 === PROTOCOL) return { open: data.open || null };
  return parseArgs(argv, { cwd, skip });
}

function setupSingleInstance(app, { argv = process.argv, cwd = process.cwd(), skip = 1, onRequest }) {
  const request = parseArgs(argv, { cwd, skip });
  const primary = app.requestSingleInstanceLock(toLockData(request));
  if (!primary) return { primary: false, request };
  app.on('second-instance', (_e, argv2, cwd2, data) => onRequest(fromSecondInstance(argv2, cwd2, data, skip)));
  return { primary: true, request };
}

module.exports = { parseArgs, setupSingleInstance, toLockData, fromSecondInstance, PROTOCOL };
