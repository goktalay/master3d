'use strict';
// Ana sürecin yüklenebilirliği: electron sahte modülle değiştirilir, main.js çalıştırılır; IPC kanalları preload.js ile
// uyumlu, giriş penceresi m3:// adresinden açılır, ayarlar süzülür, dosya açma ve dışa aktarma kaydı doğrulanır.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const { tmpDir } = require('./helpers');

test('main.js: IPC yüzeyi, giriş penceresi, ayarlar, dosya açma ve kaydetme', async () => {
  const userData = tmpDir('m3-main-');
  const handles = new Map();
  const ons = new Map();
  const windows = [];
  let whenReadyResolve;
  const ready = new Promise((r) => (whenReadyResolve = r));
  const privileged = [];
  let handler = null;
  let saveTarget = null;

  class FakeWindow {
    constructor(opts) { this.opts = opts; this.webContents = { send() {}, reload() {}, id: windows.length }; windows.push(this); }
    setMenuBarVisibility() {} loadURL(u) { this.url = u; } loadFile(f) { this.url = f; }
    on() {} once() {} isDestroyed() { return false; } isMinimized() { return false; } isMaximized() { return false; } getBounds() { return { x: 0, y: 0, width: 1, height: 1 }; }
    show() {} focus() {} hide() {} destroy() {} restore() {} maximize() {}
    static getAllWindows() { return windows; }
    static fromWebContents() { return windows[0]; }
  }
  const electron = {
    app: {
      requestSingleInstanceLock: () => true, on() {}, exit() {}, quit() {},
      getPath: (k) => (k === 'userData' ? userData : path.join(userData, k)), getLocale: () => 'tr-TR', getVersion: () => '1.0.0',
      isPackaged: false, setAppUserModelId() {}, whenReady: () => ready,
    },
    BrowserWindow: FakeWindow,
    ipcMain: { handle: (ch, fn) => handles.set(ch, fn), on: (ch, fn) => ons.set(ch, fn) },
    safeStorage: { isEncryptionAvailable: () => false },
    shell: { openExternal() {}, openPath() {}, showItemInFolder() {} },
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: saveTarget }), showOpenDialog: async () => ({ canceled: true }) },
    clipboard: { writeImage() {} },
    nativeTheme: { themeSource: 'system', shouldUseDarkColors: true },
    nativeImage: { createFromBuffer: () => ({}) },
    Notification: { isSupported: () => false },
    protocol: { registerSchemesAsPrivileged: (l) => privileged.push(...l), handle: (s, fn) => { handler = fn; } },
    screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return electron;
    if (request === '@napi-rs/keyring') throw new Error('keyring yok (test)');
    return origLoad.call(this, request, ...rest);
  };
  try {
    require('../src/main.js');
    whenReadyResolve();
    await new Promise((r) => setTimeout(r, 80));
  } finally {
    Module._load = origLoad;
  }
  // m3 protokolü ayrıcalıklı ve işleyicisi kayıtlı
  assert.equal(privileged[0].scheme, 'm3');
  assert.equal(privileged[0].privileges.standard, true);
  assert.equal(typeof handler, 'function');
  // IPC yüzeyi preload.js ile birebir
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const used = [...preload.matchAll(/ipcRenderer\.invoke\('([\w:]+)'/g)].map((m) => m[1]);
  for (const ch of used) assert.ok(handles.has(ch), ch);
  assert.ok(ons.has('app:lang') && ons.has('app:version'));
  // Girişsiz başlangıç: giriş penceresi m3://app adresinden
  assert.equal(windows.length, 1);
  assert.equal(windows[0].url, 'm3://app/src/renderer/login.html');
  assert.equal(windows[0].opts.webPreferences.sandbox, true);
  assert.equal(windows[0].opts.webPreferences.nodeIntegration, false);
  // Ayarlar süzülür (bilinmeyen anahtarlar ve değerler)
  await handles.get('settings:set')({}, { appTheme: 'zebra', viewer: { units: 'parsec', cadQuality: 'high', grid: 'evet' }, exportPrefs: { format: 'xyz' }, hack: 1 });
  const st = await handles.get('store:get')();
  assert.equal(st.settings.appTheme, 'system');
  assert.equal(st.settings.viewer.units, 'auto');
  assert.equal(st.settings.viewer.cadQuality, 'high');
  assert.equal(st.settings.viewer.grid, true);
  assert.equal(st.settings.exportPrefs.format, 'glb');
  assert.ok(!('hack' in st.settings));
  // Dosya açma: desteklenmeyen uzantı, olmayan dosya, gerçek dosya (son açılanlara eklenir, m3://file adresi)
  const dir = tmpDir('m3-open-');
  fs.writeFileSync(path.join(dir, 'Parça 1.stl'), 'solid x\nendsolid x\n');
  fs.writeFileSync(path.join(dir, 'not.txt'), 'x');
  assert.equal((await handles.get('file:openPath')({}, path.join(dir, 'not.txt'))).code, 'unsupported');
  assert.equal((await handles.get('file:openPath')({}, path.join(dir, 'yok.stl'))).code, 'not_found');
  const ok = await handles.get('file:openPath')({}, path.join(dir, 'Parça 1.stl'));
  assert.equal(ok.ok, true);
  assert.match(ok.file.url, /^m3:\/\/file\/[0-9a-f]{24}\/Par%C3%A7a%201\.stl$/);
  assert.equal((await handles.get('store:get')()).recent[0].name, 'Parça 1.stl');
  // Protokol üzerinden okuma: açılan klasördeki dosya okunur, klasör dışı okunmaz
  const res = await handler({ url: ok.file.url });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'solid x\nendsolid x\n');
  assert.equal((await handler({ url: ok.file.baseUrl + '..%2f..%2fetc%2fpasswd' })).status, 404);
  assert.equal((await handler({ url: 'm3://app/src/main.js' })).status, 404);
  const page = await handler({ url: 'm3://app/src/renderer/index.html' });
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('Content-Security-Policy').includes("default-src 'self'"));
  // Dışa aktarma: OBJ yeni adla kaydedilince .mtl de yeni adla ve mtllib satırı güncel
  saveTarget = path.join(dir, 'yeni ad.obj');
  const r = await handles.get('export:save')({ sender: {} }, { files: [{ name: 'model.obj', data: new TextEncoder().encode('mtllib model.mtl\nv 0 0 0\n') }, { name: 'model.mtl', data: new TextEncoder().encode('newmtl a\n') }, { name: '../kaçış.png', data: new Uint8Array([1]) }] });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(saveTarget, 'utf8').split('\n')[0], 'mtllib yeni ad.mtl');
  assert.ok(fs.existsSync(path.join(dir, 'yeni ad.mtl')));
  assert.ok(!fs.existsSync(path.join(dir, '..', 'kaçış.png')), 'dosya adı klasör dışına çıkamaz');
});
