// Dosya yükleme hattı: ana süreçten gelen dosya tanımı ({ name, url, baseUrl, token, size }) → bayt okuma (ilerlemeli) →
// core/load.mjs (motor seçimi) → sahne. WebAssembly motorları her iş için ayrı bir çalışan iş parçacığında koşar ve iş
// bitince kapatılır.

import * as THREE from 'three';
import { loadModel } from '../../core/load.mjs';

const GEN = new URL('./gen/', document.baseURI).href;          // src/renderer/gen/
const VENDOR = GEN + 'vendor/';

// İlerlemeli okuma: Content-Length varsa yüzde, yoksa okunan bayt
export async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error('read_failed'), { code: 'read_failed' });
  const total = Number(res.headers.get('Content-Length')) || 0;
  if (!res.body || !onProgress) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    const now = performance.now();
    if (now - last > 60) { last = now; onProgress(got, total); }
  }
  onProgress(got, total);
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

// Bir iş için çalışan iş parçacığı; iptal edilebilir (kullanıcı başka dosya açınca ya da Esc)
let activeWorkers = new Set();
export function cancelWorkers() {
  for (const w of activeWorkers) w.terminate();
  activeWorkers.clear();
}
export function runWorker(kind, payload, transfer = [], { onStage } = {}) {
  return new Promise((resolve, reject) => {
    const w = new Worker(GEN + 'engine-worker.js');
    activeWorkers.add(w);
    const done = () => { activeWorkers.delete(w); w.terminate(); };
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'stage') { onStage && onStage(m.key); return; }
      done();
      if (m.type === 'done') resolve(m.result);
      else reject(Object.assign(new Error(m.message || 'worker_failed'), { code: 'parse_failed', detail: m.message }));
    };
    w.onerror = (e) => { done(); reject(Object.assign(new Error(e.message || 'worker_failed'), { code: 'parse_failed', detail: e.message })); };
    w.postMessage({ kind, payload, vendor: VENDOR }, transfer);
  });
}

// file: ana süreçten; opts: { renderer, cadQuality, onProgress(got,total), onStage(key) }
export async function loadFile(file, opts = {}) {
  let bytes = null;
  const src = {
    name: file.name,
    url: file.url,
    baseUrl: file.baseUrl,
    async bytes() {
      if (!bytes) bytes = await fetchBytes(file.url, opts.onProgress);
      // Motorlar ArrayBuffer'ı çalışan iş parçacığına aktarabilir (sahiplik geçer): her çağrıda kopya
      return bytes.slice(0);
    },
    async sidecars() {
      const list = await window.api.sidecars(file.token);
      const out = [];
      for (const s of list) {
        try { out.push({ name: s.name, bytes: await fetchBytes(s.url) }); } catch { /* okunamayan yan dosya atlanır */ }
      }
      return out;
    },
  };
  const manager = new THREE.LoadingManager();
  const missing = new Set();
  manager.onError = (url) => missing.add(decodeURIComponent(String(url).split('/').pop() || url));
  const warnings = [];
  const t0 = performance.now();
  const ctx = {
    libPath: GEN,
    renderer: opts.renderer,
    manager,
    onStage: opts.onStage,
    runWorker: (kind, payload, transfer) => runWorker(kind, { ...payload, quality: opts.cadQuality }, transfer, { onStage: opts.onStage }),
  };
  const r = await loadModel(src, ctx, warnings);
  // Dokular eşzamansız yüklenir; yükleme yöneticisi boşalınca eksikler uyarı olur
  await new Promise((res) => {
    if (!manager.itemsLoaded || manager.itemsLoaded >= manager.itemsTotal) { setTimeout(res, 0); return; }
    const prev = manager.onLoad;
    manager.onLoad = () => { if (prev) prev(); res(); };
    setTimeout(res, 8000);
  });
  for (const m of missing) warnings.push({ key: 'warn.missingFile', vars: { name: m } });
  r.loadMs = Math.round(performance.now() - t0);
  r.bytes = bytes ? bytes.byteLength : file.size;
  return r;
}
