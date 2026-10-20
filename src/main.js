'use strict';

// Master 3D — ana süreç. 3B dosyaları açar (okuma ve dönüştürme pencerede, WebAssembly çalışan iş parçacıklarında),
// dışa aktarılan dosyaları ve ekran görüntülerini kaydeder, Gezgin sağ tık kaydını yönetir. Dosyalar yalnız bu
// bilgisayarda işlenir; hiçbir 3B veri ağa gönderilmez. Hesap ve uçtan uca şifreli ayar senkronu Mastertool ortak yapısı.

const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog, clipboard, nativeTheme, nativeImage, Notification, protocol, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const I18N = require('./i18n');
const FORMATS = require('./formats');
const PROTO = require('./protocol');
const { setupSingleInstance } = require('./instance');
const { createShellMenu } = require('./shellmenu');
const { createAccount, API_BASE } = require('./account');
const { createSso } = require('./sso');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'build', 'icon.png');
const APP_NAME = 'Master 3D';
const APP_CODE = 'm3';
const RECENT_MAX = 12;
const SIDECAR_MAX_FILES = 200;
const SIDECAR_MAX_BYTES = 512 * 1024 * 1024;
const WRITE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

PROTO.registerPrivileged(protocol); // app hazır olmadan önce

// Tek örnek: ikinci çalıştırma dosyasını açık pencereye iletir
let pendingOpen = null;
let onOpenRequest = (req) => { if (req.open) pendingOpen = req.open; };
const inst = setupSingleInstance(app, { onRequest: (req) => onOpenRequest(req) });
if (!inst.primary) app.exit(0);
else { if (inst.request.open) pendingOpen = inst.request.open; main(); }

function main() {
  let t = I18N.createT('en');
  const currentLang = () => (store && store.settings.language) || I18N.resolveLanguage(app.getLocale());
  function applyLanguage() { t = I18N.createT(currentLang()); }

  // -------------------------------------------------------------------------
  // Kalıcı depo (userData/store.json)
  // -------------------------------------------------------------------------
  const storePath = () => path.join(app.getPath('userData'), 'store.json');

  // Görüntüleyici tercihleri (senkronlanır). Varsayılanlar Mastertool görünümüne göre.
  const defaultViewer = () => ({
    background: 'gradient',  // gradient | solid | dark | light | transparent
    grid: true, axes: false, shadows: true, edges: false, bbox: false,
    lighting: 'studio',      // studio | soft | headlight | flat
    units: 'auto',           // auto | mm | cm | m | in | ft (ölçülerin gösterim birimi)
    upAxis: 'auto',          // auto | y | z
    projection: 'perspective', // perspective | orthographic
    cadQuality: 'medium',    // low | medium | high (STEP / IGES üçgenleme)
    explodeMode: 'radial',   // radial | x | y | z | tree
    autoRotate: false, invertZoom: false, showStats: true,
  });
  const defaultExport = () => ({ format: 'glb', scope: 'all', onlyVisible: true, exploded: false, convert: true, each: false });

  const defaultStore = () => ({
    syncMeta: {},
    recent: [],              // [{ path, name, size, openedAt }] — yalnız bu cihazda, senkronlanmaz
    settings: {
      appTheme: 'system', language: null, viewer: defaultViewer(), exportPrefs: defaultExport(),
      // cihaza özgü (senkronlanmaz)
      checkUpdates: true, shellMenu: true, shellLast: null, bounds: null, maximized: false,
    },
  });

  let store = null;
  const pick = (obj, def) => { const o = { ...def }; for (const k of Object.keys(def)) if (obj && k in obj && typeof obj[k] === typeof def[k]) o[k] = obj[k]; return o; };
  const ENUMS = {
    background: ['gradient', 'solid', 'dark', 'light', 'transparent'], lighting: ['studio', 'soft', 'headlight', 'flat'],
    units: ['auto', 'mm', 'cm', 'm', 'in', 'ft'], upAxis: ['auto', 'y', 'z'], projection: ['perspective', 'orthographic'],
    cadQuality: ['low', 'medium', 'high'], explodeMode: ['radial', 'x', 'y', 'z', 'tree'],
  };
  function sanitizeViewer(v) {
    const o = pick(v, defaultViewer());
    for (const [k, list] of Object.entries(ENUMS)) if (!list.includes(o[k])) o[k] = defaultViewer()[k];
    return o;
  }
  function sanitizeExport(v) {
    const o = pick(v, defaultExport());
    if (!FORMATS.exportById(o.format)) o.format = 'glb';
    if (!['all', 'selected', 'visible'].includes(o.scope)) o.scope = 'all';
    return o;
  }

  function loadStore() {
    try {
      store = { ...defaultStore(), ...JSON.parse(fs.readFileSync(storePath(), 'utf8')) };
      store.settings = { ...defaultStore().settings, ...(store.settings || {}) };
      if (!store.syncMeta) store.syncMeta = {};
    } catch {
      store = defaultStore();
    }
    store.settings.viewer = sanitizeViewer(store.settings.viewer);
    store.settings.exportPrefs = sanitizeExport(store.settings.exportPrefs);
    store.recent = (Array.isArray(store.recent) ? store.recent : []).filter((r) => r && typeof r.path === 'string').slice(0, RECENT_MAX);
    applyAppTheme();
    applyLanguage();
  }

  let saveTimer = null;
  function saveStore({ sync = true } = {}) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeStore, 150);
    if (sync && account) account.onLocalChange();
  }
  function writeStore() {
    clearTimeout(saveTimer);
    saveTimer = null;
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8');
  }

  function applyAppTheme() {
    const v = store.settings.appTheme;
    nativeTheme.themeSource = v === 'dark' || v === 'light' ? v : 'system';
  }
  const windowBg = () => (nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#eef2f7');

  function encrypt(text) {
    if (!text) return '';
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64');
    return 'b64:' + Buffer.from(text, 'utf8').toString('base64');
  }
  function decrypt(value) {
    if (!value) return '';
    if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    if (value.startsWith('b64:')) return Buffer.from(value.slice(4), 'base64').toString('utf8');
    return value;
  }

  function publicSettings() {
    const { shellLast, bounds, maximized, ...rest } = store.settings;
    return { ...rest, language: store.settings.language || currentLang() };
  }
  // Son açılanlar: dosya hâlâ yerinde mi (kart soluk görünür)
  function publicRecent() {
    return store.recent.map((r) => {
      let exists = false;
      try { exists = fs.statSync(r.path).isFile(); } catch { /* yok */ }
      return { ...r, exists, format: (FORMATS.formatOf(r.name) || {}).id || null };
    });
  }
  const publicStore = () => ({ settings: publicSettings(), recent: publicRecent(), platform: process.platform });
  function broadcastStore() {
    const data = publicStore();
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('store:changed', data);
  }

  const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;

  // -------------------------------------------------------------------------
  // Gezgin sağ tık menüsü (yalnız paketli Windows sürümünde; geliştirmede electron.exe yazılmasın)
  // -------------------------------------------------------------------------
  const shellMenu = createShellMenu({ exe: exePath(), platform: app.isPackaged ? process.platform : 'none' });
  async function ensureShellMenu() {
    if (!shellMenu.supported) return;
    const r = await shellMenu.ensure(!!store.settings.shellMenu, t('shell.verb'), store.settings.shellLast);
    if (r.last !== store.settings.shellLast) { store.settings.shellLast = r.last; saveStore({ sync: false }); }
  }

  // -------------------------------------------------------------------------
  // Mastertool hesabı (mastertool.download, /api/m3)
  // -------------------------------------------------------------------------
  let account = null;
  let loginWindow = null;
  let mainWindow = null;
  let loginNotice = null;
  let updateInfo = null;

  function initSso() {
    try { return createSso({ stateDir: path.join(app.getPath('appData'), 'Mastertool') }); } catch { return null; }
  }

  function initAccount() {
    account = createAccount({
      sso: initSso(),
      onSharedSignIn: () => enterApp(),
      onSharedSignOut: (code) => showLogin(code === 'app_disabled' ? t('auth.errAppDisabled') : null),
      userDataDir: app.getPath('userData'),
      appVersion: app.getVersion(),
      encrypt, decrypt,
      getStore: () => store,
      replaceLibrary: ({ settings, syncMeta }) => {
        const prevLang = currentLang();
        store.syncMeta = syncMeta;
        Object.assign(store.settings, settings);
        store.settings.viewer = sanitizeViewer(store.settings.viewer);
        store.settings.exportPrefs = sanitizeExport(store.settings.exportPrefs);
        writeStore();
        applyAppTheme();
        applyLanguage();
        if (currentLang() !== prevLang) onLanguageChanged();
        else broadcastStore();
      },
      persistStore: writeStore,
      resetSyncMeta: () => { store.syncMeta = {}; writeStore(); },
      onStatus: (st) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('account:status', st); },
      onSessionExpired: (code) => showLogin(t(code === 'app_disabled' ? 'auth.errAppDisabled' : code === 'wrong_app' ? 'auth.errWrongApp' : 'auth.errSessionExpired')),
      onUpdate: (info) => {
        updateInfo = info;
        notifyUpdate(info);
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('app:update', info);
      },
    });
  }

  function notifyUpdate(info) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: t('update.available', { version: info.version }), body: t('update.hint'), icon: ICON, silent: true });
    n.on('click', () => openWeb('account'));
    n.show();
  }

  function enterApp() {
    loginNotice = null;
    if (!mainWindow) createMainWindow();
    if (loginWindow) loginWindow.destroy();
    account.start().then(() => store.settings.checkUpdates && account.checkUpdate()).catch(() => {});
  }

  const webPreferences = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false };

  function createLoginWindow() {
    loginWindow = new BrowserWindow({
      width: 440, height: 640, resizable: false, maximizable: false,
      backgroundColor: windowBg(), title: APP_NAME, icon: ICON, autoHideMenuBar: true, webPreferences,
    });
    loginWindow.setMenuBarVisibility(false);
    loginWindow.loadURL(PROTO.appUrl('src/renderer/login.html'));
    loginWindow.on('closed', () => {
      loginWindow = null;
      if (!account || !account.isLoggedIn()) quit();
    });
  }

  function showLogin(notice) {
    loginNotice = notice || null;
    if (!loginWindow) createLoginWindow();
    else {
      loginWindow.webContents.reload();
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.show();
      loginWindow.focus();
    }
    for (const w of BrowserWindow.getAllWindows()) if (w !== loginWindow) w.destroy();
    mainWindow = null;
  }

  // -------------------------------------------------------------------------
  // Ana pencere: boyut ve konum (bu cihazda) hatırlanır
  // -------------------------------------------------------------------------
  function validBounds(b) {
    if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
    const areas = screen.getAllDisplays().map((d) => d.workArea);
    const visible = areas.some((a) => b.x + 80 > a.x && b.y + 40 > a.y && b.x < a.x + a.width - 80 && b.y < a.y + a.height - 40);
    return visible ? b : { width: b.width, height: b.height };
  }

  let isQuitting = false;
  function createMainWindow() {
    const b = validBounds(store.settings.bounds) || {};
    mainWindow = new BrowserWindow({
      width: b.width || 1440, height: b.height || 900, x: b.x, y: b.y, minWidth: 960, minHeight: 600,
      backgroundColor: windowBg(), title: APP_NAME, icon: ICON, autoHideMenuBar: true, show: false, webPreferences,
    });
    mainWindow.setMenuBarVisibility(false);
    if (store.settings.maximized) mainWindow.maximize();
    mainWindow.loadURL(PROTO.appUrl('src/renderer/index.html'));
    mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
    const remember = () => {
      if (!mainWindow || mainWindow.isMinimized()) return;
      store.settings.maximized = mainWindow.isMaximized();
      if (!store.settings.maximized) store.settings.bounds = mainWindow.getBounds();
      saveStore({ sync: false });
    };
    mainWindow.on('resized', remember);
    mainWindow.on('moved', remember);
    mainWindow.on('maximize', remember);
    mainWindow.on('unmaximize', remember);
    mainWindow.on('closed', () => { mainWindow = null; });
    return mainWindow;
  }

  function showMainWindow() {
    if (!account || !account.isLoggedIn()) {
      if (!loginWindow) { showLogin(); return; }
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.show();
      loginWindow.focus();
      return;
    }
    if (!mainWindow) createMainWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  function quit() {
    isQuitting = true;
    if (saveTimer) writeStore();
    app.quit();
  }

  // -------------------------------------------------------------------------
  // Dosya açma: klasör jetonu + m3://file adresleri
  // -------------------------------------------------------------------------
  const roots = PROTO.createRoots();

  function describe(file) {
    const st = fs.statSync(file);
    if (!st.isFile()) throw Object.assign(new Error('not_file'), { code: 'not_file' });
    const name = path.basename(file);
    const fmt = FORMATS.formatOf(name);
    if (!fmt) throw Object.assign(new Error('unsupported'), { code: 'unsupported', ext: FORMATS.extOf(name) });
    const dir = path.dirname(file);
    const tok = roots.add(dir);
    return {
      name, path: file, dir, size: st.size, mtime: st.mtimeMs, format: fmt.id, engine: fmt.engine,
      token: tok, url: PROTO.fileUrl(tok, name), baseUrl: `${PROTO.SCHEME}://file/${tok}/`,
    };
  }

  function addRecent(d) {
    store.recent = [{ path: d.path, name: d.name, size: d.size, openedAt: Date.now() }, ...store.recent.filter((r) => r.path.toLowerCase() !== d.path.toLowerCase())].slice(0, RECENT_MAX);
    saveStore({ sync: false });
  }

  function openPath(file) {
    try {
      const d = describe(path.resolve(String(file || '')));
      addRecent(d);
      broadcastStore();
      return { ok: true, file: d };
    } catch (e) {
      return { ok: false, code: e.code === 'ENOENT' ? 'not_found' : e.code || 'error', ext: e.ext || '', message: e.message };
    }
  }

  // Dışarıdan gelen açma isteği (ikinci örnek, argv): pencere hazırsa ilet, değilse bekle
  function deliverOpen(file) {
    if (!file) return;
    if (!mainWindow) { pendingOpen = file; showMainWindow(); return; }
    mainWindow.webContents.send('file:openRequest', openPath(file));
    showMainWindow();
  }
  onOpenRequest = (req) => { if (req.open) deliverOpen(req.open); else showMainWindow(); };

  // -------------------------------------------------------------------------
  // IPC — ortak
  // -------------------------------------------------------------------------
  ipcMain.on('app:lang', (e) => { e.returnValue = currentLang(); });
  ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });
  ipcMain.handle('store:get', () => publicStore());

  const DEVICE_SETTINGS = ['checkUpdates', 'shellMenu'];
  ipcMain.handle('settings:set', async (_e, patch) => {
    const p = { ...(patch || {}) };
    const allowed = ['appTheme', 'language', 'viewer', 'exportPrefs', ...DEVICE_SETTINGS];
    for (const k of Object.keys(p)) if (!allowed.includes(k)) delete p[k];
    if ('appTheme' in p) p.appTheme = ['dark', 'light', 'system'].includes(p.appTheme) ? p.appTheme : 'system';
    if ('language' in p) p.language = I18N.LANGUAGES[p.language] ? p.language : null;
    if ('viewer' in p) p.viewer = sanitizeViewer({ ...store.settings.viewer, ...(p.viewer || {}) });
    if ('exportPrefs' in p) p.exportPrefs = sanitizeExport({ ...store.settings.exportPrefs, ...(p.exportPrefs || {}) });
    for (const k of DEVICE_SETTINGS) if (k in p) p[k] = !!p[k];
    const prevLang = currentLang();
    Object.assign(store.settings, p);
    saveStore({ sync: Object.keys(p).some((k) => !DEVICE_SETTINGS.includes(k)) });
    if ('appTheme' in p) applyAppTheme();
    if ('shellMenu' in p) ensureShellMenu().catch(() => {});
    if ('language' in p) {
      applyLanguage();
      if (currentLang() !== prevLang) { ensureShellMenu().catch(() => {}); onLanguageChanged(); return { ok: true }; }
    }
    broadcastStore();
    return { ok: true };
  });

  function onLanguageChanged() {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.reload();
  }

  // --- Dosyalar ---------------------------------------------------------------
  ipcMain.handle('file:openDialog', async (e) => {
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: t('open.title'), properties: ['openFile'], filters: [...FORMATS.dialogFilters(t), { name: t('open.allFiles'), extensions: ['*'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, code: 'canceled' };
    return openPath(res.filePaths[0]);
  });
  ipcMain.handle('file:openPath', (_e, p) => openPath(p));
  ipcMain.handle('file:pending', () => { const p = pendingOpen; pendingOpen = null; return p ? openPath(p) : null; });
  ipcMain.handle('file:recentRemove', (_e, p) => {
    store.recent = store.recent.filter((r) => r.path !== p);
    saveStore({ sync: false });
    broadcastStore();
    return { ok: true };
  });
  ipcMain.handle('file:recentClear', () => { store.recent = []; saveStore({ sync: false }); broadcastStore(); return { ok: true }; });
  ipcMain.handle('file:showInFolder', (_e, p) => {
    if (store.recent.some((r) => r.path === p) && fs.existsSync(p)) shell.showItemInFolder(p);
    return { ok: true };
  });

  // assimp gibi motorlar dosyanın yanındaki dokuları/malzemeleri bellekte ister: aynı klasördeki (ve bir alt düzeydeki)
  // yan dosyaların adları. İçerik m3://file/<jeton>/ adresinden okunur.
  ipcMain.handle('file:sidecars', (_e, tok) => {
    const dir = roots.get(String(tok || ''));
    if (!dir) return [];
    const out = [];
    let total = 0;
    const scan = (d, prefix, depth) => {
      let list = [];
      try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const ent of list) {
        if (out.length >= SIDECAR_MAX_FILES) return;
        if (ent.isDirectory() && depth < 1 && !ent.name.startsWith('.')) { scan(path.join(d, ent.name), prefix + ent.name + '/', depth + 1); continue; }
        if (!ent.isFile() || !FORMATS.SIDECAR_EXTS.includes(FORMATS.extOf(ent.name))) continue;
        let size = 0;
        try { size = fs.statSync(path.join(d, ent.name)).size; } catch { continue; }
        if (total + size > SIDECAR_MAX_BYTES) return;
        total += size;
        out.push({ name: prefix + ent.name, url: PROTO.fileUrl(tok, prefix + ent.name), size });
      }
    };
    scan(dir, '', 0);
    return out;
  });

  // --- Dışa aktarma ve ekran görüntüsü --------------------------------------------
  // Dosya adı güvenliği: yalnız ad (yol ayıracı, sürücü, .. yok)
  const safeName = (n) => String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/^\.+/, '_').slice(0, 180) || 'model';
  function toBuffer(data) {
    if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (typeof data === 'string') return Buffer.from(data, 'utf8');
    throw Object.assign(new Error('bad_data'), { code: 'bad_data' });
  }
  function uniquePath(p) {
    if (!fs.existsSync(p)) return p;
    const ext = path.extname(p), base = p.slice(0, -ext.length || undefined);
    for (let i = 2; i < 1000; i++) { const c = `${base} (${i})${ext}`; if (!fs.existsSync(c)) return c; }
    return p;
  }
  ipcMain.handle('export:save', async (e, { files, filterName }) => {
    if (!Array.isArray(files) || !files.length) return { ok: false, code: 'bad_data' };
    const total = files.reduce((a, f) => a + (f.data ? f.data.byteLength || f.data.length || 0 : 0), 0);
    if (total > WRITE_MAX_BYTES) return { ok: false, code: 'too_large' };
    const mainFile = files[0];
    const ext = path.extname(safeName(mainFile.name)).slice(1) || 'bin';
    const res = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: t('exp.title'), defaultPath: path.join(lastExportDir(), safeName(mainFile.name)),
      filters: [{ name: filterName || ext.toUpperCase(), extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, code: 'canceled' };
    try {
      const target = res.filePath;
      fs.writeFileSync(target, toBuffer(mainFile.data));
      // Ek dosyalar (OBJ'nin .mtl'si, dokular) aynı klasöre; ana dosyanın yeni adına göre
      const oldStem = path.basename(mainFile.name, path.extname(mainFile.name));
      const newStem = path.basename(target, path.extname(target));
      let objText = null;
      for (const f of files.slice(1)) {
        let name = safeName(f.name);
        if (name.startsWith(oldStem)) name = newStem + name.slice(oldStem.length);
        fs.writeFileSync(path.join(path.dirname(target), name), toBuffer(f.data));
        if (name !== safeName(f.name) && /\.mtl$/i.test(name)) objText = [safeName(f.name), name];
      }
      // OBJ yeniden adlandırıldıysa "mtllib" satırı da yeni ada
      if (objText && /\.obj$/i.test(target)) {
        const s = fs.readFileSync(target, 'utf8').replace(`mtllib ${objText[0]}`, `mtllib ${objText[1]}`);
        fs.writeFileSync(target, s, 'utf8');
      }
      store.settings.lastExportDir = path.dirname(target);
      saveStore({ sync: false });
      return { ok: true, path: target, name: path.basename(target) };
    } catch (err) {
      return { ok: false, code: 'write_failed', message: err.message };
    }
  });
  ipcMain.handle('export:saveFolder', async (e, { files }) => {
    if (!Array.isArray(files) || !files.length) return { ok: false, code: 'bad_data' };
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: t('exp.chooseFolder'), defaultPath: lastExportDir(), properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths[0]) return { ok: false, code: 'canceled' };
    const dir = res.filePaths[0];
    try {
      for (const f of files) fs.writeFileSync(uniquePath(path.join(dir, safeName(f.name))), toBuffer(f.data));
      store.settings.lastExportDir = dir;
      saveStore({ sync: false });
      return { ok: true, path: dir, count: files.length };
    } catch (err) {
      return { ok: false, code: 'write_failed', message: err.message };
    }
  });
  const lastExportDir = () => {
    const d = store.settings.lastExportDir;
    return d && fs.existsSync(d) ? d : app.getPath('documents');
  };
  ipcMain.handle('export:showInFolder', (_e, p) => {
    if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
    return { ok: true };
  });
  ipcMain.handle('screenshot:copy', (_e, png) => {
    try { clipboard.writeImage(nativeImage.createFromBuffer(toBuffer(png))); return { ok: true }; } catch (err) { return { ok: false, message: err.message }; }
  });

  // --- Gezgin sağ tık ---------------------------------------------------------------
  ipcMain.handle('shell:status', async () => ({ ...(await shellMenu.status()), enabled: !!store.settings.shellMenu }));

  // --- Hesap ------------------------------------------------------------------------
  ipcMain.handle('account:state', () => ({ ...account.state(), notice: loginNotice, appVersion: app.getVersion() }));
  ipcMain.handle('account:login', async (_e, { email, password, remember }) => {
    try {
      await account.login(email, password, remember);
      enterApp();
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e.code || 'error', message: e.message };
    }
  });
  ipcMain.handle('account:logout', async () => { await account.logout(); showLogin(); });
  ipcMain.handle('account:syncNow', () => account.syncNow());
  ipcMain.handle('account:setSync', async (_e, on) => {
    try { await account.setSyncEnabled(on); return { ok: true }; } catch (e) { return { ok: false, code: e.code }; }
  });
  ipcMain.handle('account:deleteRemote', async () => {
    try { await account.deleteRemote(); return { ok: true }; } catch (e) { return { ok: false, code: e.code }; }
  });

  ipcMain.handle('app:openMastertool', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    shell.openExternal(`https://mastertool.download/?lang=${encodeURIComponent(currentLang())}&theme=${theme}`);
  });

  function openWeb(page) {
    const allowed = { forgot: '/sifremi-unuttum', register: '/kayit', account: '/hesabim', tool: '/araclar/master-3d' };
    if (!allowed[page]) return;
    const q = new URLSearchParams({ lang: currentLang(), theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light', app: APP_CODE });
    shell.openExternal(`${API_BASE}${allowed[page]}?${q}`);
  }
  ipcMain.handle('account:openWeb', (_e, page) => openWeb(page));

  ipcMain.handle('app:about', () => ({
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    portable: isPortable(), packaged: app.isPackaged, update: updateInfo, platform: process.platform,
  }));
  ipcMain.handle('app:checkUpdate', async () => {
    try { return { ok: true, ...(await account.checkUpdate({ manual: true })) }; } catch (e) { return { ok: false, code: e.code || 'error', message: e.message }; }
  });
  ipcMain.handle('app:openLicenses', () => {
    const file = path.join(path.dirname(process.execPath), 'LICENSES.chromium.html');
    if (fs.existsSync(file)) return shell.openPath(file);
    return shell.openExternal('https://www.electronjs.org/docs/latest#license');
  });

  // -------------------------------------------------------------------------
  app.setAppUserModelId('com.mastertool.master3d');

  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e) => e.preventDefault());
    // Gezgin'den pencereye bırakılan dosya: gezinme yerine pencere kendi sürükle-bırak işleyicisini kullanır
    wc.on('will-attach-webview', (e) => e.preventDefault());
  });
  app.on('before-quit', () => (isQuitting = true));
  app.on('window-all-closed', () => quit());

  app.whenReady().then(async () => {
    PROTO.register({ protocol, root: ROOT, roots });
    loadStore();
    initAccount();
    ensureShellMenu().catch(() => {});
    if (!account.isLoggedIn()) {
      const r = await account.trySharedSignIn();
      if (r.code === 'app_disabled') loginNotice = t('auth.errAppDisabled');
    }
    account.watchShared();
    if (account.isLoggedIn()) {
      createMainWindow();
      account.start().then(() => store.settings.checkUpdates && account.checkUpdate()).catch(() => {});
    } else {
      showLogin(loginNotice);
    }
  });
}
