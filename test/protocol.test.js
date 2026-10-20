'use strict';
// m3:// protokolü: yalnız izinli uygulama dosyaları; kullanıcı dosyaları yalnız açılan klasörün içinden (.., mutlak yol,
// sürücü harfi ve sembolik bağ ile dışarı çıkılamaz). Güvenlik politikaları: pencere eval'siz, iş parçacığı WASM + eval.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../src/protocol');
const { tmpDir } = require('./helpers');

const ROOT = path.join(__dirname, '..');

test('uygulama yolları: yalnız izinli önekler', () => {
  assert.equal(P.resolveAppPath(ROOT, '/src/renderer/index.html'), path.join(ROOT, 'src', 'renderer', 'index.html'));
  assert.equal(P.resolveAppPath(ROOT, '/src/i18n.js'), path.join(ROOT, 'src', 'i18n.js'));
  assert.equal(P.resolveAppPath(ROOT, '/build/icon.png'), path.join(ROOT, 'build', 'icon.png'));
  for (const bad of ['/src/main.js', '/src/account.js', '/package.json', '/src/renderer/../main.js', '/src/renderer/%2e%2e/main.js', '/../etc/passwd',
    '/src/renderer/..%5cmain.js', '/node_modules/three/package.json', '/build/icon.ico', '', '/src/renderer/%00x']) {
    assert.equal(P.resolveAppPath(ROOT, bad), null, bad);
  }
});

test('kullanıcı dosyaları: klasör dışına çıkılamaz', () => {
  const base = tmpDir('m3-proto-');
  fs.mkdirSync(path.join(base, 'tex'));
  fs.writeFileSync(path.join(base, 'model.obj'), 'v 0 0 0');
  fs.writeFileSync(path.join(base, 'tex', 'a b#c.png'), 'x');
  const outside = tmpDir('m3-out-');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 's');
  assert.equal(P.resolveFilePath(base, '/model.obj'), fs.realpathSync(path.join(base, 'model.obj')));
  assert.equal(P.resolveFilePath(base, '/' + P.encodePath('tex/a b#c.png')), fs.realpathSync(path.join(base, 'tex', 'a b#c.png')));
  assert.equal(P.resolveFilePath(base, '/tex\\a b#c.png'), fs.realpathSync(path.join(base, 'tex', 'a b#c.png')));
  for (const bad of ['/../' + path.basename(outside) + '/secret.txt', '/..%2f' + path.basename(outside) + '%2fsecret.txt', '/tex/../../x', '/C:/Windows/win.ini', '/', '/tex', '/missing.png']) {
    assert.equal(P.resolveFilePath(base, bad), null, bad);
  }
  // Sembolik bağ ile dışarı çıkma
  try {
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(base, 'link.txt'));
    assert.equal(P.resolveFilePath(base, '/link.txt'), null);
  } catch (e) { if (e.code !== 'EPERM') throw e; }
});

test('klasör jetonları: aynı klasör aynı jeton, sınır aşılınca eskiler düşer', () => {
  const r = P.createRoots(3);
  const a = r.add('/a');
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.equal(r.add('/a'), a);
  r.add('/b'); r.add('/c'); r.add('/d');
  assert.equal(r.get(a), null);
  assert.equal(r.size(), 3);
  assert.equal(P.fileUrl('ab', 'x y/z#.png'), 'm3://file/ab/x%20y/z%23.png');
});

test('güvenlik politikaları', () => {
  assert.equal(P.cspFor('/src/renderer/index.html'), P.CSP);
  assert.equal(P.cspFor('/src/renderer/gen/app.js'), P.CSP);
  assert.equal(P.cspFor('/src/renderer/gen/engine-worker.js'), P.WORKER_CSP);
  assert.equal(P.cspFor('/src/renderer/gen/rhino3dm/rhino-worker.js'), P.WORKER_CSP);
  assert.equal(P.cspFor('/build/icon.png'), null);
  assert.ok(!P.CSP.includes("'unsafe-eval'"), 'pencere eval çalıştırmaz');
  assert.ok(!/https?:/.test(P.CSP) && !/https?:/.test(P.WORKER_CSP), 'ağ adresi yok');
  assert.ok(P.WORKER_CSP.includes("'wasm-unsafe-eval'") && P.WORKER_CSP.includes("default-src 'none'"));
});
