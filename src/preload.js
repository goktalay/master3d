'use strict';

// Giriş ve ana pencere (yalıtılmış, sandbox; Node erişimi yok)
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  lang: ipcRenderer.sendSync('app:lang'),
  version: ipcRenderer.sendSync('app:version'),

  // Mastertool hesabı ve senkron
  accountState: () => ipcRenderer.invoke('account:state'),
  login: (email, password, remember) => ipcRenderer.invoke('account:login', { email, password, remember }),
  logout: () => ipcRenderer.invoke('account:logout'),
  syncNow: () => ipcRenderer.invoke('account:syncNow'),
  setSyncEnabled: (on) => ipcRenderer.invoke('account:setSync', on),
  deleteRemoteLibrary: () => ipcRenderer.invoke('account:deleteRemote'),
  openWeb: (page) => ipcRenderer.invoke('account:openWeb', page), // 'forgot' | 'register' | 'account' | 'tool'
  onAccountStatus: on('account:status'),
  onUpdateAvailable: on('app:update'),
  openMastertool: () => ipcRenderer.invoke('app:openMastertool'),
  about: () => ipcRenderer.invoke('app:about'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  openLicenses: () => ipcRenderer.invoke('app:openLicenses'),

  // ayarlar
  getStore: () => ipcRenderer.invoke('store:get'),
  onStoreChanged: on('store:changed'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  shellStatus: () => ipcRenderer.invoke('shell:status'),

  // dosyalar (içerik m3://file/… adresinden okunur)
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  openPath: (p) => ipcRenderer.invoke('file:openPath', p),
  pendingOpen: () => ipcRenderer.invoke('file:pending'),
  onOpenRequest: on('file:openRequest'),
  // Pencereye sürüklenen dosyanın yolu (Electron 32+: File.path yerine webUtils)
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  sidecars: (token) => ipcRenderer.invoke('file:sidecars', token),
  recentRemove: (p) => ipcRenderer.invoke('file:recentRemove', p),
  recentClear: () => ipcRenderer.invoke('file:recentClear'),
  showInFolder: (p) => ipcRenderer.invoke('file:showInFolder', p),

  // dışa aktarma ve ekran görüntüsü
  saveExport: (files, filterName) => ipcRenderer.invoke('export:save', { files, filterName }),
  saveExportFolder: (files) => ipcRenderer.invoke('export:saveFolder', { files }),
  showExported: (p) => ipcRenderer.invoke('export:showInFolder', p),
  copyImage: (png) => ipcRenderer.invoke('screenshot:copy', png),
});
